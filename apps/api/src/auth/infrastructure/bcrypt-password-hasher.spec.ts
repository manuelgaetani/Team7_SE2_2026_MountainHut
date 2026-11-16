import bcrypt from 'bcrypt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a bcrypt hash with cost 10, never the plain password', async () => {
    const stored = await hasher.hash('password123');
    expect(stored).not.toBe('password123');
    expect(bcrypt.getRounds(stored)).toBe(10);
    await expect(bcrypt.compare('password123', stored)).resolves.toBe(true);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await bcrypt.hash('giusta123', 4);
    await expect(hasher.compare('giusta123', stored)).resolves.toBe(true);
    await expect(hasher.compare('sbagliata', stored)).resolves.toBe(false);
  });

  it('still runs a bcrypt comparison when there is no hash, and rejects', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    await expect(hasher.compare('qualsiasi', null)).resolves.toBe(false);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith('qualsiasi', expect.stringMatching(/^\$2[aby]\$10\$/));
  });

  it('computes the dummy hash lazily, once', async () => {
    const hashSync = vi.spyOn(bcrypt, 'hashSync');
    const fresh = new BcryptPasswordHasher();
    expect(hashSync).not.toHaveBeenCalled();
    await fresh.compare('a', null);
    await fresh.compare('b', null);
    expect(hashSync).toHaveBeenCalledTimes(1);
  });
});
