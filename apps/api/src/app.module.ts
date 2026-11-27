import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { SlotsModule } from './slots/slots.module.js';
import { HikersModule } from './hikers/hikers.module.js';
import { MenusModule } from './menus/menus.module.js';
import { DomainExceptionFilter } from './presentation/domain-exception.filter.js';

// In production the API also serves the built SPA (same origin, no CORS).
// In development the SPA runs on the Vite dev server instead.
const webDistPath = resolve(process.env.WEB_DIST_PATH ?? '../web/dist');
const staticModules = existsSync(webDistPath)
  ? [ServeStaticModule.forRoot({ rootPath: webDistPath, exclude: ['/api/{*path}'] })]
  : [];

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    ...staticModules,
    AuthModule,
    BookingsModule,
    SlotsModule,
    HikersModule,
    MenusModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
