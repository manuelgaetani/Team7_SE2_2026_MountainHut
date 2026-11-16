import { Global, Module } from '@nestjs/common';
import { AppConfig, loadAppConfig } from './app-config.js';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadAppConfig(process.env) }],
  exports: [AppConfig],
})
export class ConfigModule {}
