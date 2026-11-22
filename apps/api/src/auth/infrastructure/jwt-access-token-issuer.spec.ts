import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer.js';

describe('JwtAccessTokenIssuer', () => {
  it('puts the user id, email and role in the access token', async () => {
    const jwt = { signAsync: vi.fn().mockResolvedValue('token-finto') };
    const issuer = new JwtAccessTokenIssuer(jwt as unknown as JwtService);
    await expect(
      issuer.sign({ id: 3, email: 'a@b.it', role: 'WARDEN', mustChangePassword: false }),
    ).resolves.toBe('token-finto');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 3, email: 'a@b.it', role: 'WARDEN' });
  });
});
