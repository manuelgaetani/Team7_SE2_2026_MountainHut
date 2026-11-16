import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { PrismaService } from './prisma.service.js';
import { TransactionContext } from './transaction-context.js';

// One interactive Prisma transaction per run. A nested run reuses the outer transaction
// instead of opening a second one, which would not see the outer writes or locks.
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TransactionContext,
  ) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.inTransaction()) return work();
    return this.prisma.$transaction((tx) => this.context.runIn(tx, work));
  }
}
