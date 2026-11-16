import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const config = {
    databaseUrl: 'postgresql://user:password@localhost:5432/test',
  } as AppConfig;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects when the module starts', async () => {
    const service = new PrismaService(config);
    const connect = vi.spyOn(service, '$connect').mockResolvedValue();
    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the module stops', async () => {
    const service = new PrismaService(config);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
