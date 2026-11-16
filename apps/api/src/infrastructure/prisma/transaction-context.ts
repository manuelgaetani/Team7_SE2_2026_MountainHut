import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

// The transaction of the current unit of work, shared by PrismaUnitOfWork and the repositories.
// AsyncLocalStorage follows the async calls of one request, so concurrent requests never see
// each other's transaction.
@Injectable()
export class TransactionContext {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {}

  // The client the repositories must use: the open transaction, or the plain client.
  client(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }

  inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  runIn<T>(tx: Prisma.TransactionClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}
