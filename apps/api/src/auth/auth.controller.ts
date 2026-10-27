import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthUser, LoginInput, RegisterInput } from '@mountain-hut/shared';
import { loginSchema, registerSchema } from '@mountain-hut/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

const ACCESS_COOKIE = 'token';
const REFRESH_COOKIE = 'refresh_token';
// Il refresh cookie viene inviato solo alle rotte /api/auth/*
const REFRESH_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(body);
    this.setSessionCookies(res, session);
    return session.user;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('Non autenticato');
    const session = await this.auth.refresh(raw);
    this.setSessionCookies(res, session);
    return session.user;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(raw);
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { message: 'Logout effettuato' };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: AuthUser }) {
    return req.user;
  }

  private setSessionCookies(res: Response, session: AuthSession): void {
    const secure = process.env.NODE_ENV === 'production';
    // Nessun maxAge: la scadenza dell'access token la decide il JWT (JWT_EXPIRES_IN).
    res.cookie(ACCESS_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: REFRESH_PATH,
      expires: session.refreshExpiresAt,
    });
  }
}