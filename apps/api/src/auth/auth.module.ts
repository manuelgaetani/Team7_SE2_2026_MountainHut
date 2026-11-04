import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import cookieParser from 'cookie-parser';

type SignOptions = NonNullable<JwtModuleOptions['signOptions']>;

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }
        return {
          secret,
          signOptions: {
            expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'],
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard],
  exports: [AuthGuard, RolesGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('{*splat}');
  }
}
