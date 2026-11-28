import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MenusRepository } from './application/menus.repository.port.js';
import { MenusService } from './application/menus.service.js';
import { PrismaMenusRepository } from './infrastructure/prisma-menus.repository.js';
import { MenusController } from './presentation/menus.controller.js';

// MH-10: the menus of the slots.
@Module({
  imports: [AuthModule],
  controllers: [MenusController],
  providers: [MenusService, { provide: MenusRepository, useClass: PrismaMenusRepository }],
})
export class MenusModule {}
