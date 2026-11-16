import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoRefreshTokenGenerator } from './crypto-refresh-token-generator.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('CryptoRefreshTokenGenerator', () => {
  const generator = new CryptoRefreshTokenGenerator();

  it('generates 32 random bytes encoded as base64url', () => {
    const { raw } = generator.generate();
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
  });

  it('stores only the SHA-256 hash of the refresh token', () => {
    const { raw, hash } = generator.generate();
    expect(hash).toBe(sha256(raw));
    expect(hash).not.toBe(raw);
  });

  it('hashes a received token the same way', () => {
    expect(generator.hash('raw-token')).toBe(sha256('raw-token'));
  });

  it('issues a different refresh token every time', () => {
    expect(generator.generate().raw).not.toBe(generator.generate().raw);
  });
});
