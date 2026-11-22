import { fireEvent, screen, within } from '@testing-library/react';
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
    expect(
      within(screen.getByRole('navigation')).queryByRole('link', { name: 'Book a table' }),
    ).not.toBeInTheDocument();
  });

  it('shows sign out, not the email, to the user of the session', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
  });

  it('links a hiker to their bookings', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'My bookings' })).toHaveAttribute(
      'href',
      '/bookings',
    );
  });

  it('does not link the staff to the bookings of a hiker', async () => {
    stubApi({ '/api/auth/me': () => json({ ...user, role: 'EMPLOYEE' }) });
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument();
  });

  it('renews an expired session', async () => {
    stubApi({ '/api/auth/refresh': () => json(user) });
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
