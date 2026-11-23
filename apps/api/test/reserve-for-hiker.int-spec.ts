import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import type { CreateStaffBookingInput } from '@mountain-hut/shared';
import {
  ConfirmationSender,
  TimerSleeper,
} from '../src/bookings/application/confirmation-sender.js';
import { CreateStaffBooking } from '../src/bookings/application/create-staff-booking.js';
import { PrismaBookingsRepository } from '../src/bookings/infrastructure/prisma-bookings.repository.js';
import { CryptoPasswordGenerator } from '../src/auth/infrastructure/crypto-password-generator.js';
import { PrismaUnitOfWork } from '../src/infrastructure/prisma/prisma-unit-of-work.js';
import { BookingConfirmationAdapter } from '../src/notifications/infrastructure/booking-confirmation.adapter.js';
import { Mailer } from '../src/notifications/mailer.js';
import type { MailMessage } from '../src/notifications/mailer.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import { MAX_HIKER_SEARCH_RESULTS, SearchHikers } from '../src/hikers/application/search-hikers.js';
import { PrismaHikersRepository } from '../src/hikers/infrastructure/prisma-hikers.repository.js';
import { ChangePassword } from '../src/auth/application/change-password.js';
import { ConfirmPasswordReset } from '../src/auth/application/confirm-password-reset.js';
import { PasswordResetNotifier } from '../src/auth/application/ports.js';
import { RequestPasswordReset } from '../src/auth/application/request-password-reset.js';
import { SessionIssuer } from '../src/auth/application/session-issuer.js';
import { BcryptPasswordHasher } from '../src/auth/infrastructure/bcrypt-password-hasher.js';
import { CryptoRefreshTokenGenerator } from '../src/auth/infrastructure/crypto-refresh-token-generator.js';
import { JwtAccessTokenIssuer } from '../src/auth/infrastructure/jwt-access-token-issuer.js';
import { PrismaPasswordResetTokenRepository } from '../src/auth/infrastructure/prisma-password-reset-token.repository.js';
import { PrismaRefreshTokenRepository } from '../src/auth/infrastructure/prisma-refresh-token.repository.js';
import { PrismaUsersRepository } from '../src/auth/infrastructure/prisma-users.repository.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

// MH-07 with PostgreSQL: the reservation entered by the staff, the hiker search for the staff,
// password change and password recovery.

// Keeps the codes of the links instead of sending emails.
class FakeNotifier extends PasswordResetNotifier {
  sent: { userId: number; token: string; expiresAt: Date }[] = [];

  async send(user: { id: number; email: string }, token: string, expiresAt: Date): Promise<void> {
    this.sent.push({ userId: user.id, token, expiresAt });
  }
}

// Keeps the booking confirmation emails instead of sending them.
class FakeMailer extends Mailer {
  sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const PASSWORD = 'OldPassword1';

// The slot of the staff reservations: 19:00 in Rome on 1 July 2031 (summer time, UTC+2).
const SLOT_DAY = '2031-07-01';
const SLOT_START = new Date('2031-07-01T17:00:00.000Z');

describe('Reserve for a hiker with PostgreSQL (integration) - MH-07', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);

  const hikers = new PrismaHikersRepository(context);
  const searchHikers = new SearchHikers(hikers);

  const users = new PrismaUsersRepository(context);
  const refreshTokens = new PrismaRefreshTokenRepository(context);
  const resetTokens = new PrismaPasswordResetTokenRepository(context);
  const passwords = new BcryptPasswordHasher();
  const codes = new CryptoRefreshTokenGenerator();
  const notifier = new FakeNotifier();
  const sessions = new SessionIssuer(
    new JwtAccessTokenIssuer(new JwtService({ secret: 'int-test-secret' })),
    codes,
    refreshTokens,
    config,
  );
  const requestReset = new RequestPasswordReset(users, resetTokens, codes, notifier);
  const confirmReset = new ConfirmPasswordReset(
    resetTokens,
    codes,
    users,
    passwords,
    refreshTokens,
  );
  const changePassword = new ChangePassword(users, passwords, refreshTokens, sessions);

  const bookings = new PrismaBookingsRepository(context);
  const mailer = new FakeMailer();
  const confirmations = new ConfirmationSender(
    new BookingConfirmationAdapter(context, new NotificationService(mailer, prisma)),
    bookings,
    new TimerSleeper(),
  );
  const createStaffBooking = new CreateStaffBooking(
    new PrismaUnitOfWork(prisma, context),
    bookings,
    hikers,
    passwords,
    new CryptoPasswordGenerator(),
    confirmations,
    config,
  );

  const reserve = (input: CreateStaffBookingInput, now?: Date) =>
    createStaffBooking.execute(input, now);
  const slot = (seats: number[]) => createSlot(prisma, SLOT_DAY, '19:00', '21:00', seats);
  const temporary = (fullName: string) => ({ kind: 'TEMPORARY' as const, fullName });
  const newAccount = (email: string) => ({
    kind: 'ACCOUNT' as const,
    email,
    fullName: 'Desk Hiker',
    phone: '+39 347 7654321',
  });
  const counts = async () => ({
    users: await prisma.user.count(),
    hikers: await prisma.hiker.count(),
    bookings: await prisma.booking.count(),
  });
  const seatsOf = (bookingId: number) =>
    prisma.bookingTable.findMany({
      where: { bookingId },
      orderBy: { tableNumber: 'asc' },
      select: { tableNumber: true, assignedSeats: true },
    });

  // The confirmation email is sent after the commit: wait for it, so it does not run into the
  // next test.
  const emailedTo = (to: string) =>
    vi.waitFor(() => {
      const message = mailer.sent.find((m) => m.to === to);
      expect(message).toBeDefined();
      return message!;
    });

  // A user with a hiker profile and a real bcrypt password.
  async function account(email: string, fullName = 'Test Hiker', phone = '3331234567') {
    const user = await prisma.user.create({
      data: {
        email,
        password: await passwords.hash(PASSWORD),
        hiker: { create: { fullName, phone } },
      },
    });
    return user.id;
  }

  const temporaryHiker = (fullName: string, phone: string | null = null) =>
    prisma.hiker.create({ data: { fullName, phone } });

  const userRow = (id: number) => prisma.user.findUniqueOrThrow({ where: { id } });
  const activeSessions = (userId: number) =>
    prisma.refreshToken.count({ where: { userId, revokedAt: null } });
  const resetRows = (userId: number) =>
    prisma.passwordResetToken.findMany({ where: { userId }, orderBy: { id: 'asc' } });

  beforeEach(async () => {
    await resetDatabase(prisma);
    notifier.sent = [];
    mailer.sent = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('hiker search', () => {
    it('matches the name ignoring case, the phone and the email of the account', async () => {
      await account('anna.rossi@example.test', 'Anna Rossi', '+39 333 1112223');
      await account('bruno@example.test', 'Bruno Bianchi', '+39 340 9998887');

      expect((await searchHikers.execute('ROSSI')).map((h) => h.fullName)).toEqual(['Anna Rossi']);
      expect((await searchHikers.execute('9998')).map((h) => h.fullName)).toEqual([
        'Bruno Bianchi',
      ]);
      expect((await searchHikers.execute('ANNA.ROSSI@')).map((h) => h.fullName)).toEqual([
        'Anna Rossi',
      ]);
    });

    it('returns the full profile, and marks a hiker without an account as temporary', async () => {
      const userId = await account('anna@example.test', 'Anna Verdi', '3331234567');
      const walkIn = await temporaryHiker('Walk-in Verdi');

      expect(await searchHikers.execute('verdi')).toEqual([
        {
          id: (await prisma.hiker.findUniqueOrThrow({ where: { userId } })).id,
          fullName: 'Anna Verdi',
          email: 'anna@example.test',
          phone: '3331234567',
          notes: null,
          emergencyContact: null,
          temporary: false,
        },
        {
          id: walkIn.id,
          fullName: 'Walk-in Verdi',
          email: null,
          phone: null,
          notes: null,
          emergencyContact: null,
          temporary: true,
        },
      ]);
    });

    it('orders by name, then by id for the same name', async () => {
      const second = await temporaryHiker('Carla Neri');
      await temporaryHiker('Andrea Neri');
      const third = await temporaryHiker('Carla Neri');

      expect((await searchHikers.execute('neri')).map((h) => [h.fullName, h.id])).toEqual([
        ['Andrea Neri', expect.any(Number)],
        ['Carla Neri', second.id],
        ['Carla Neri', third.id],
      ]);
    });

    it(`returns at most ${MAX_HIKER_SEARCH_RESULTS} hikers`, async () => {
      await prisma.hiker.createMany({
        data: Array.from({ length: MAX_HIKER_SEARCH_RESULTS + 5 }, (_, i) => ({
          fullName: `Gialli ${String(i).padStart(2, '0')}`,
        })),
      });

      expect(await searchHikers.execute('gialli')).toHaveLength(MAX_HIKER_SEARCH_RESULTS);
    });

    it('treats % and _ as plain characters, not as wildcards', async () => {
      await temporaryHiker('Anna Rossi');
      await temporaryHiker('Bruno Bianchi');

      expect(await searchHikers.execute('%%')).toEqual([]);
      expect(await searchHikers.execute('__')).toEqual([]);
    });

    it('does not return a staff account, which has no hiker profile', async () => {
      await prisma.user.create({
        data: { email: 'mario.staff@example.test', password: 'x', role: 'EMPLOYEE' },
      });

      expect(await searchHikers.execute('mario')).toEqual([]);
    });
  });

  describe('password recovery', () => {
    it('stores only the hash of the link code, valid for 24 hours', async () => {
      const userId = await account('anna@example.test');
      const before = Date.now();

      await requestReset.execute({ email: 'anna@example.test' });

      expect(notifier.sent).toHaveLength(1);
      const [{ token, expiresAt }] = notifier.sent;
      const [row] = await resetRows(userId);
      expect(row.tokenHash).toBe(codes.hash(token));
      expect(row.tokenHash).not.toContain(token);
      expect(row.usedAt).toBeNull();
      expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
      expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(24 * HOUR_MS - 1000);
      expect(expiresAt.getTime() - before).toBeLessThanOrEqual(24 * HOUR_MS + 1000);
    });

    it('stores nothing and sends nothing for an unknown email', async () => {
      await requestReset.execute({ email: 'nobody@example.test' });

      expect(notifier.sent).toEqual([]);
      expect(await prisma.passwordResetToken.count()).toBe(0);
    });

    it('a new request spends the previous link', async () => {
      const userId = await account('anna@example.test');
      await requestReset.execute({ email: 'anna@example.test' });
      await requestReset.execute({ email: 'anna@example.test' });

      const [first, second] = await resetRows(userId);
      expect(first.usedAt).not.toBeNull();
      expect(second.usedAt).toBeNull();
      await expect(
        confirmReset.execute({ token: notifier.sent[0].token, password: 'NewPassword1' }),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
    });

    it('sets the new password, ends a forced change and closes every session', async () => {
      const userId = await account('anna@example.test');
      await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
      await sessions.issue({
        id: userId,
        email: 'anna@example.test',
        role: 'HIKER',
        mustChangePassword: true,
      });
      await sessions.issue({
        id: userId,
        email: 'anna@example.test',
        role: 'HIKER',
        mustChangePassword: true,
      });
      await requestReset.execute({ email: 'anna@example.test' });

      await confirmReset.execute({ token: notifier.sent[0].token, password: 'NewPassword1' });

      const user = await userRow(userId);
      expect(await passwords.compare('NewPassword1', user.password)).toBe(true);
      expect(await passwords.compare(PASSWORD, user.password)).toBe(false);
      expect(user.mustChangePassword).toBe(false);
      expect(await activeSessions(userId)).toBe(0);
      expect((await resetRows(userId))[0].usedAt).not.toBeNull();
    });

    it('a link works once', async () => {
      await account('anna@example.test');
      await requestReset.execute({ email: 'anna@example.test' });
      const { token } = notifier.sent[0];

      await confirmReset.execute({ token, password: 'NewPassword1' });
      await expect(
        confirmReset.execute({ token, password: 'OtherPassword1' }),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
    });

    it('of two requests with the same link at the same time, only one changes the password', async () => {
      const userId = await account('anna@example.test');
      await requestReset.execute({ email: 'anna@example.test' });
      const { token } = notifier.sent[0];

      const results = await Promise.allSettled([
        confirmReset.execute({ token, password: 'FirstPassword1' }),
        confirmReset.execute({ token, password: 'SecondPassword1' }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const user = await userRow(userId);
      const first = await passwords.compare('FirstPassword1', user.password);
      const second = await passwords.compare('SecondPassword1', user.password);
      expect(first !== second).toBe(true);
    });

    it('refuses a link at its expiry time, and keeps the password', async () => {
      const userId = await account('anna@example.test');
      await requestReset.execute({ email: 'anna@example.test' });
      const { token, expiresAt } = notifier.sent[0];

      await expect(
        confirmReset.execute({ token, password: 'NewPassword1' }, expiresAt),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
      await expect(
        confirmReset.execute(
          { token, password: 'NewPassword1' },
          new Date(expiresAt.getTime() - 1),
        ),
      ).resolves.toBeUndefined();
      expect(await passwords.compare('NewPassword1', (await userRow(userId)).password)).toBe(true);
    });

    it('deletes the links with their user', async () => {
      const userId = await account('anna@example.test');
      await requestReset.execute({ email: 'anna@example.test' });

      await prisma.user.delete({ where: { id: userId } });

      expect(await prisma.passwordResetToken.count()).toBe(0);
    });
  });

  describe('change password', () => {
    it('stores the new password, ends a forced change and keeps only the new session', async () => {
      const userId = await account('anna@example.test');
      await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
      await sessions.issue({
        id: userId,
        email: 'anna@example.test',
        role: 'HIKER',
        mustChangePassword: true,
      });
      await sessions.issue({
        id: userId,
        email: 'anna@example.test',
        role: 'HIKER',
        mustChangePassword: true,
      });

      const session = await changePassword.execute(userId, {
        currentPassword: PASSWORD,
        newPassword: 'NewPassword1',
      });

      expect(session.user.mustChangePassword).toBe(false);
      const user = await userRow(userId);
      expect(await passwords.compare('NewPassword1', user.password)).toBe(true);
      expect(user.mustChangePassword).toBe(false);
      expect(await activeSessions(userId)).toBe(1);
      const active = await prisma.refreshToken.findFirstOrThrow({
        where: { userId, revokedAt: null },
      });
      expect(active.tokenHash).toBe(codes.hash(session.refreshToken));
    });

    it('changes nothing when the current password is wrong', async () => {
      const userId = await account('anna@example.test');
      await sessions.issue({
        id: userId,
        email: 'anna@example.test',
        role: 'HIKER',
        mustChangePassword: false,
      });
      const before = await userRow(userId);

      await expect(
        changePassword.execute(userId, {
          currentPassword: 'WrongPassword1',
          newPassword: 'NewPassword1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect((await userRow(userId)).password).toBe(before.password);
      expect(await activeSessions(userId)).toBe(1);
    });
  });

  describe('reservation entered by the staff', () => {
    it('books an existing hiker: confirmed at once, seated at the tables and emailed', async () => {
      const userId = await account('anna@example.test', 'Anna Rossi');
      const hiker = await prisma.hiker.findUniqueOrThrow({ where: { userId } });
      const slotId = await slot([4, 2]);

      const result = await reserve({
        slotId,
        partySize: 5,
        hiker: { kind: 'EXISTING', hikerId: hiker.id },
      });

      expect(result).toMatchObject({
        slotId,
        partySize: 5,
        status: 'CONFIRMED',
        hiker: { id: hiker.id, email: 'anna@example.test', temporary: false },
      });
      expect(result).not.toHaveProperty('generatedPassword');
      const seats = await seatsOf(result.id);
      expect(seats).toEqual(result.tables);
      expect(seats.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(5);

      const email = await emailedTo('anna@example.test');
      expect(email.subject).toContain(`Booking n. ${result.id} confirmed`);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.id } });
      expect(booking.status).toBe('CONFIRMED');
    });

    it('quick entry: stores a temporary hiker without an account, and sends no email', async () => {
      const slotId = await slot([4]);

      const result = await reserve({
        slotId,
        partySize: 2,
        hiker: { kind: 'TEMPORARY', fullName: 'Walk In', phone: '+39 320 1112233' },
      });

      expect(result.hiker).toMatchObject({
        email: null,
        phone: '+39 320 1112233',
        temporary: true,
      });
      const hiker = await prisma.hiker.findUniqueOrThrow({ where: { id: result.hiker.id } });
      expect(hiker).toMatchObject({ fullName: 'Walk In', userId: null });
      expect(await prisma.user.count()).toBe(0);
      expect(result.status).toBe('CONFIRMED');
      // Nothing to wait for: a temporary hiker has no email.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mailer.sent).toEqual([]);
      expect(await prisma.notification.count()).toBe(0);
    });

    it('full details: an account with a generated password, stored as a hash, to be changed', async () => {
      const slotId = await slot([4]);

      const result = await reserve({
        slotId,
        partySize: 2,
        hiker: {
          ...newAccount('new@example.test'),
          notes: 'Vegetarian',
          emergencyContact: 'Luca 3331234567',
        },
      });

      const password = result.generatedPassword!;
      expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'new@example.test' },
        include: { hiker: true },
      });
      expect(user).toMatchObject({ role: 'HIKER', mustChangePassword: true });
      expect(user.password).not.toBe(password);
      expect(await passwords.compare(password, user.password)).toBe(true);
      expect(user.hiker).toMatchObject({
        id: result.hiker.id,
        fullName: 'Desk Hiker',
        phone: '+39 347 7654321',
        notes: 'Vegetarian',
        emergencyContact: 'Luca 3331234567',
      });
      await emailedTo('new@example.test');
    });

    it('stores the party requirements in the order they were entered', async () => {
      const requirements = [
        { allergies: true, description: '2 nut allergies' },
        { allergies: false, description: '1 vegetarian' },
      ];

      const result = await reserve({
        slotId: await slot([6]),
        partySize: 5,
        requirements,
        hiker: temporary('Group Leader'),
      });

      expect(
        await prisma.partyRequirement.findMany({
          where: { bookingId: result.id },
          orderBy: { id: 'asc' },
          select: { allergies: true, description: true },
        }),
      ).toEqual(requirements);
    });

    it('can be entered until the slot begins, also within 2 hours of it', async () => {
      const slotId = await slot([8]);

      const early = await reserve(
        { slotId, partySize: 2, hiker: temporary('One Minute Before') },
        new Date(SLOT_START.getTime() - MINUTE_MS),
      );
      expect(early.status).toBe('CONFIRMED');

      await expect(
        reserve({ slotId, partySize: 2, hiker: temporary('At The Start') }, SLOT_START),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE', message: 'The slot has already started' });
      expect(await prisma.booking.count()).toBe(1);
    });

    it('a refused reservation stores neither the new hiker nor the new account', async () => {
      const slotId = await slot([4]);

      await expect(
        reserve({ slotId, partySize: 5, hiker: newAccount('new@example.test') }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        reserve({ slotId, partySize: 5, hiker: temporary('Too Many') }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        reserve({ slotId, partySize: 2, hiker: temporary('Too Late') }, SLOT_START),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
      await expect(
        reserve({ slotId: slotId + 1, partySize: 2, hiker: temporary('No Slot') }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Slot not found' });

      expect(await counts()).toEqual({ users: 0, hikers: 0, bookings: 0 });
    });

    it('refuses an email already registered and leaves the existing account as it was', async () => {
      const userId = await account('anna@example.test');
      const before = await userRow(userId);

      await expect(
        reserve({ slotId: await slot([4]), partySize: 2, hiker: newAccount('anna@example.test') }),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Email already registered' });

      expect(await userRow(userId)).toEqual(before);
      expect(await counts()).toEqual({ users: 1, hikers: 1, bookings: 0 });
    });

    it('refuses an unknown hiker', async () => {
      await expect(
        reserve({
          slotId: await slot([4]),
          partySize: 2,
          hiker: { kind: 'EXISTING', hikerId: 999 },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Hiker not found' });
      expect(await prisma.booking.count()).toBe(0);
    });

    it('counts the seats of pending and confirmed bookings, not of rejected ones', async () => {
      const slotId = await slot([4]);
      const pending = await createHiker(prisma, 'pending@example.test');
      const rejected = await createHiker(prisma, 'rejected@example.test');
      await createBooking(prisma, pending.hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await createBooking(prisma, rejected.hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);

      await expect(
        reserve({ slotId, partySize: 3, hiker: temporary('Three People') }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Insufficient seats available for this slot',
      });
      const result = await reserve({ slotId, partySize: 2, hiker: temporary('Two People') });
      expect(result.tables).toEqual([{ tableNumber: 1, assignedSeats: 2 }]);
    });

    it('one active booking per hiker and slot: a rejected one does not count', async () => {
      const slotId = await slot([8]);
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      await createBooking(prisma, hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const input = { slotId, partySize: 2, hiker: { kind: 'EXISTING' as const, hikerId } };

      await reserve(input);
      await emailedTo('anna@example.test');
      await expect(reserve(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'The hiker already has a booking for this slot',
      });
      expect(await prisma.booking.count({ where: { hikerId, status: 'CONFIRMED' } })).toBe(1);
    });

    it('of two reservations for the last seats at the same time, only one is stored', async () => {
      const slotId = await slot([4]);

      const results = await Promise.allSettled([
        reserve({ slotId, partySize: 4, hiker: temporary('First Party') }),
        reserve({ slotId, partySize: 4, hiker: temporary('Second Party') }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'CONFLICT' },
      });
      // The hiker of the refused reservation is rolled back with it.
      expect(await counts()).toEqual({ users: 0, hikers: 1, bookings: 1 });
    });

    it('of two new accounts with the same email at the same time, only one is created', async () => {
      const [first, second] = [
        await slot([4]),
        await createSlot(prisma, SLOT_DAY, '12:00', '13:00', [4]),
      ];

      const results = await Promise.allSettled([
        reserve({ slotId: first, partySize: 2, hiker: newAccount('same@example.test') }),
        reserve({ slotId: second, partySize: 2, hiker: newAccount('same@example.test') }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'CONFLICT', message: 'Email already registered' },
      });
      expect(await counts()).toEqual({ users: 1, hikers: 1, bookings: 1 });
      await emailedTo('same@example.test');
    });
  });

  describe('database rules', () => {
    it('a hiker with an account must have a phone; a temporary hiker may not', async () => {
      const user = await prisma.user.create({
        data: { email: 'anna@example.test', password: 'x' },
      });

      await expect(
        prisma.hiker.create({ data: { fullName: 'Anna', phone: null, userId: user.id } }),
      ).rejects.toThrow();
      await expect(temporaryHiker('Walk-in', null)).resolves.toMatchObject({ phone: null });
    });

    it('two links cannot have the same code', async () => {
      const userId = await account('anna@example.test');
      const expiresAt = new Date(Date.now() + HOUR_MS);
      await resetTokens.create(userId, 'same-hash', expiresAt);

      await expect(resetTokens.create(userId, 'same-hash', expiresAt)).rejects.toThrow();
    });
  });
});
