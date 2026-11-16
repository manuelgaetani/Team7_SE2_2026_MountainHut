import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../shared-kernel/domain-error.js';
import type { PasswordHasher, UsersRepository } from './ports.js';
import { RegisterUser } from './register-user.js';

const input = {
  email: 'a@b.it',
  password: 'password123',
  fullName: 'Anna Rossi',
  phone: '3331234567',
};
const created = { id: 2, email: 'a@b.it', role: 'HIKER' as const };

describe('RegisterUser', () => {
  const users = { findByEmail: vi.fn(), findById: vi.fn(), createWithHiker: vi.fn() };
  const hasher = { hash: vi.fn(), compare: vi.fn() };
  let register: RegisterUser;

  beforeEach(() => {
    vi.resetAllMocks();
    hasher.hash.mockResolvedValue('bcrypt-hash');
    register = new RegisterUser(
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasher,
    );
  });

  it('lancia Conflict se l’email esiste già', async () => {
    users.findByEmail.mockResolvedValue({ ...created, id: 1, passwordHash: 'x' });
    await expect(register.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Email already registered',
    });
    expect(users.createWithHiker).not.toHaveBeenCalled();
  });

  it('crea l’utente e restituisce solo id, email e ruolo', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.createWithHiker.mockResolvedValue(created);
    await expect(register.execute(input)).resolves.toEqual(created);
  });

  it('stores the hash of the password, never the plain password', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.createWithHiker.mockResolvedValue(created);
    await register.execute(input);
    expect(hasher.hash).toHaveBeenCalledWith('password123');
    expect(users.createWithHiker).toHaveBeenCalledWith(input, 'bcrypt-hash');
  });

  it('passes on the Conflict of a concurrent registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.createWithHiker.mockRejectedValue(
      new DomainError('CONFLICT', 'Email already registered'),
    );
    await expect(register.execute(input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Email already registered',
    });
  });

  it('rethrows database errors other than a duplicate email', async () => {
    const failure = new Error('database unreachable');
    users.findByEmail.mockResolvedValue(null);
    users.createWithHiker.mockRejectedValue(failure);
    await expect(register.execute(input)).rejects.toBe(failure);
  });
});
