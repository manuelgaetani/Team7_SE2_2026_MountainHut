import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { AuthUser, LoginInput, RegisterInput } from '@mountain-hut/shared';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainError } from '../shared-kernel/domain-error.js';
import { isUniqueViolation } from '../infrastructure/prisma/prisma-errors.js';

export interface AuthSession {
  token: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

const DUMMY_HASH = bcrypt.hashSync('password-fittizia', 10);

// SHA-256 e non bcrypt: il token è già casuale e va cercato per uguaglianza.
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new DomainError('CONFLICT', 'Email already registered');

    const password = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          password,
          hiker: {
            create: {
              fullName: input.fullName,
              phone: input.phone,
              notes: input.notes,
              emergencyContact: input.emergencyContact,
            },
          },
        },
      });
      return { id: user.id, email: user.email, role: user.role };
    } catch (e) {
      // Due registrazioni concorrenti con la stessa email: vince il vincolo unique del DB.
      if (isUniqueViolation(e)) {
        throw new DomainError('CONFLICT', 'Email already registered');
      }
      throw e;
    }
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new DomainError('UNAUTHORIZED', 'Not authenticated');
    return { id: user.id, email: user.email, role: user.role };
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Il confronto avviene sempre, così i tempi non rivelano se l'email è registrata.
    const hash = user?.password ?? DUMMY_HASH;
    const matches = await bcrypt.compare(input.password, hash);
    if (!user || !matches) {
      throw new DomainError('UNAUTHORIZED', 'Invalid credentials');
    }
    return this.issueSession({ id: user.id, email: user.email, role: user.role });
  }

  async refresh(rawToken: string): Promise<AuthSession> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw new DomainError('UNAUTHORIZED', 'Invalid session');

    if (stored.revokedAt) {
      // Token già ruotato presentato di nuovo: possibile furto, chiudiamo tutte le sessioni.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new DomainError('UNAUTHORIZED', 'Invalid session');
    }
    if (stored.expiresAt <= new Date()) {
      throw new DomainError('UNAUTHORIZED', 'Session expired');
    }

    // Revoca atomica: se due richieste usano lo stesso token, solo una vince.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw new DomainError('UNAUTHORIZED', 'Invalid session');

    return this.issueSession({
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    });
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: AuthUser): Promise<AuthSession> {
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTtlMs);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { token, refreshToken, refreshExpiresAt, user };
  }
}
