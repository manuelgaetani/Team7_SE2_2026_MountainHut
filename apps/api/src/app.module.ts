import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { HealthModule } from './health/health.module.js';

// In production the API also serves the built SPA (same origin, no CORS).
// In development the SPA runs on the Vite dev server instead.
const webDistPath = resolve(process.env.WEB_DIST_PATH ?? '../web/dist');
const staticModules = existsSync(webDistPath)
  ? [ServeStaticModule.forRoot({ rootPath: webDistPath, exclude: ['/api/{*path}'] })]
  : [];

@Module({
  imports: [HealthModule, ...staticModules],
})
export class AppModule {}
