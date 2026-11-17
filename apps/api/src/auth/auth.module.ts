import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';
import { ChangePassword } from './application/change-password.js';
import { ConfirmPasswordReset } from './application/confirm-password-reset.js';
import { GetCurrentUser } from './application/get-current-user.js';
import { Login } from './application/login.js';
import { Logout } from './application/logout.js';
import {
  AccessTokenIssuer,
  PasswordHasher,
  PasswordResetTokenRepository,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UsersRepository,
} from './application/ports.js';
import { RefreshSession } from './application/refresh-session.js';
import { RegisterUser } from './application/register-user.js';
import { RequestPasswordReset } from './application/request-password-reset.js';
import { SessionIssuer } from './application/session-issuer.js';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher.js';
import { CryptoRefreshTokenGenerator } from './infrastructure/crypto-refresh-token-generator.js';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token-issuer.js';
import { PrismaPasswordResetTokenRepository } from './infrastructure/prisma-password-reset-token.repository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { PrismaUsersRepository } from './infrastructure/prisma-users.repository.js';
import { PasswordResetController } from './presentation/password-reset.controller.js';
import { RolesGuard } from './presentation/roles.guard.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import cookieParser from 'cookie-parser';

type SignOptions = NonNullable<JwtModuleOptions['signOptions']>;

@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig): JwtModuleOptions => ({
        secret: config.jwtSecret,
        signOptions: {
          expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController, PasswordResetController],
  providers: [
    RegisterUser,
    Login,
    RefreshSession,
    Logout,
    GetCurrentUser,
    ChangePassword,
    RequestPasswordReset,
    ConfirmPasswordReset,
    SessionIssuer,
    { provide: UsersRepository, useClass: PrismaUsersRepository },
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
    { provide: PasswordResetTokenRepository, useClass: PrismaPasswordResetTokenRepository },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: AccessTokenIssuer, useClass: JwtAccessTokenIssuer },
    { provide: RefreshTokenGenerator, useClass: CryptoRefreshTokenGenerator },
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthGuard, RolesGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('{*splat}');
  }
}
