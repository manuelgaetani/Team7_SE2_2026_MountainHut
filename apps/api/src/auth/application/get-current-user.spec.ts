import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetCurrentUser } from './get-current-user.js';
import type { UsersRepository } from './ports.js';

describe('GetCurrentUser', () => {
  const users = { findByEmail: vi.fn(), findById: vi.fn(), createWithHiker: vi.fn() };
  let me: GetCurrentUser;

  beforeEach(() => {
    vi.resetAllMocks();
    me = new GetCurrentUser(users as unknown as UsersRepository);
  });

  it('restituisce l’utente completo', async () => {
    users.findById.mockResolvedValue({ id: 1, email: 'a@b.it', role: 'HIKER', passwordHash: 'h' });
    await expect(me.execute(1)).resolves.toEqual({ id: 1, email: 'a@b.it', role: 'HIKER' });
    expect(users.findById).toHaveBeenCalledWith(1);
  });

  it('never returns the password hash', async () => {
    users.findById.mockResolvedValue({ id: 1, email: 'a@b.it', role: 'HIKER', passwordHash: 'h' });
    const result = await me.execute(1);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
  });

  it('lancia Unauthorized se l’utente non esiste più', async () => {
    users.findById.mockResolvedValue(null);
    await expect(me.execute(99)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  });

  // MH-07: an account created by the staff must change the generated password.
  it('reports the forced change of the password', async () => {
    users.findById.mockResolvedValue({
      id: 1,
      email: 'a@b.it',
      role: 'HIKER',
      passwordHash: 'h',
      mustChangePassword: true,
    });
    await expect(me.execute(1)).resolves.toEqual({
      id: 1,
      email: 'a@b.it',
      role: 'HIKER',
      mustChangePassword: true,
    });
  });
});
