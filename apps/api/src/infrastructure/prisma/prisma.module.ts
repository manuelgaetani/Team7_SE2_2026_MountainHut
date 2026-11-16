import { Global, Module } from '@nestjs/common';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { PrismaService } from './prisma.service.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';
import { TransactionContext } from './transaction-context.js';

@Global()
@Module({
  providers: [
    PrismaService,
    TransactionContext,
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
  ],
  exports: [PrismaService, TransactionContext, UnitOfWork],
})
export class PrismaModule {}
