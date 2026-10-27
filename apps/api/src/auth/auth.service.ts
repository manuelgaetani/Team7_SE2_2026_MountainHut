import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { AuthUser, LoginInput, RegisterInput } from '@mountain-hut/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

export interface AuthSession {
  token: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('password-fittizia', 10);

// SHA-256 e non bcrypt: il token è già casuale e va cercato per uguaglianza.
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly refreshTtlMs = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? '1') * DAY_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email già registrata');

    const password = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          password,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        },
      });
      return { id: user.id, email: input.email, firstName: user.firstName, role: user.role };
    } catch (e) {
      // Due registrazioni concorrenti con la stessa email: vince il vincolo unique del DB.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già registrata');
      }
      throw e;
    }
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) throw new UnauthorizedException('Non autenticato');
    return { id: user.id, email: user.email, firstName: user.firstName, role: user.role };
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Il confronto avviene sempre, così i tempi non rivelano se l'email è registrata.
    const hash = user?.password ?? DUMMY_HASH;
    const matches = await bcrypt.compare(input.password, hash);
    // Un utente temporaneo non ha password: non può fare login.
    if (!user || user.password == null || !matches) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    return this.issueSession({
      id: user.id,
      email: input.email,
      firstName: user.firstName,
      role: user.role,
    });
  }

  async refresh(rawToken: string): Promise<AuthSession> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Sessione non valida');

    if (stored.revokedAt) {
      // Token già ruotato presentato di nuovo: possibile furto, chiudiamo tutte le sessioni.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessione non valida');
    }
    if (stored.expiresAt <= new Date() || !stored.user.email) {
      throw new UnauthorizedException('Sessione scaduta');
    }

    // Revoca atomica: se due richieste usano lo stesso token, solo una vince.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw new UnauthorizedException('Sessione non valida');

    return this.issueSession({
      id: stored.user.id,
      email: stored.user.email,
      firstName: stored.user.firstName,
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
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { token, refreshToken, refreshExpiresAt, user };
  }
}
