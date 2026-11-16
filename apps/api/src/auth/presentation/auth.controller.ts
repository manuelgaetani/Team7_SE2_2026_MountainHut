import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { GetCurrentUser } from '../application/get-current-user.js';
import { Login } from '../application/login.js';
import { Logout } from '../application/logout.js';
import { RefreshSession } from '../application/refresh-session.js';
import { RegisterUser } from '../application/register-user.js';
import type { AuthSession } from '../application/session-issuer.js';
import { AuthGuard } from './auth.guard.js';
import type { LoginInput, RegisterInput } from '@mountain-hut/shared';
import { loginSchema, registerSchema } from '@mountain-hut/shared';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { CurrentUser } from '../../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../../presentation/current-user.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_PATH } from './session-cookies.js';

// cookie-parser turns a value starting with "j:" into an object: it is not a token.
function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly loginUser: Login,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUser: Logout,
    private readonly currentUser: GetCurrentUser,
    private readonly config: AppConfig,
  ) {}

  @Post('register')
  @ApiZodBody(registerSchema)
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.registerUser.execute(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.loginUser.execute(body);
    this.setSessionCookies(res, session);
    return session.user;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = readRefreshCookie(req);
    if (!raw) throw new UnauthorizedException('Non autenticato');
    const session = await this.refreshSession.execute(raw);
    this.setSessionCookies(res, session);
    return session.user;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.logoutUser.execute(readRefreshCookie(req));
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { message: 'Logged out' };
  }

  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.currentUser.execute(user.id);
  }

  private setSessionCookies(res: Response, session: AuthSession): void {
    const secure = this.config.secureCookies;
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
