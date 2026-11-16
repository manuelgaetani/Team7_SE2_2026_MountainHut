import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logout } from './logout.js';
import type { RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';

describe('Logout', () => {
  const tokens = { revokeByHash: vi.fn() };
  const generator = { generate: vi.fn(), hash: vi.fn() };
  let logout: Logout;

  beforeEach(() => {
    vi.resetAllMocks();
    generator.hash.mockImplementation((raw: string) => `hash(${raw})`);
    logout = new Logout(
      tokens as unknown as RefreshTokenRepository,
      generator as unknown as RefreshTokenGenerator,
    );
  });

  it('revokes only the matching token, by hash', async () => {
    await logout.execute('qualcosa');
    expect(tokens.revokeByHash).toHaveBeenCalledTimes(1);
    expect(tokens.revokeByHash).toHaveBeenCalledWith('hash(qualcosa)');
  });

  it('senza token non tocca il DB', async () => {
    await logout.execute(undefined);
    expect(tokens.revokeByHash).not.toHaveBeenCalled();
  });
});
