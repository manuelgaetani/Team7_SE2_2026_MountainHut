import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

describe('NavBar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers sign in and registration without a session', async () => {
    stubApi();
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book a table' })).toBeInTheDocument();
  });

  it('shows the user of the session', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    expect(await screen.findByText(user.email)).toBeInTheDocument();
  });

  it('renews an expired session', async () => {
    stubApi({ '/api/auth/refresh': () => json(user) });
    renderAt('/');
    expect(await screen.findByText(user.email)).toBeInTheDocument();
  });

  it.each([
    ['reading the user', { '/api/auth/me': () => json({}, 500) }],
    ['renewing the session', { '/api/auth/refresh': () => json({}, 500) }],
  ])('treats a failure while %s as no session', async (_name, handlers) => {
    stubApi(handlers);
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs out', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/auth/logout': () => json({ message: 'Logged out' }),
    });
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
  });
});
