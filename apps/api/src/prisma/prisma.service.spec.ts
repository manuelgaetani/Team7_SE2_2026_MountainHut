import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@localhost:5432/test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('refuses to start without DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => new PrismaService()).toThrow('DATABASE_URL is not defined');
  });

  it('connects when the module starts', async () => {
    const service = new PrismaService();
    const connect = vi.spyOn(service, '$connect').mockResolvedValue();
    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the module stops', async () => {
    const service = new PrismaService();
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
