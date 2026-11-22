import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

describe('HomePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invites a visitor without a session to register', async () => {
    stubApi();
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Closer to the sky.' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Register to book a table/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('lets a hiker go to the booking page', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    expect(await screen.findByRole('link', { name: /^Book a table/ })).toHaveAttribute(
      'href',
      '/book',
    );
    expect(screen.queryByRole('heading', { name: 'Ready for service.' })).not.toBeInTheDocument();
  });

  it.each(['EMPLOYEE', 'WARDEN'])('shows the staff welcome to a %s', async (role) => {
    stubApi({ '/api/auth/me': () => json({ ...user, role }) });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Ready for service.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage time slots/ })).toHaveAttribute(
      'href',
      '/staff/slots',
    );
    expect(screen.queryByRole('link', { name: /Book a table/ })).not.toBeInTheDocument();
  });
});
