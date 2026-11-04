import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, stubApi } from '../test/app.tsx';

describe('UnauthorizedPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prompts unauthenticated visitors to sign in', async () => {
    stubApi();
    renderAt('/unauthorized');

    expect(screen.getByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
    expect(
      screen.getByText(/must be signed in with an authorized staff account/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });

  it('displays user email and hiker restriction when signed in as a hiker', async () => {
    const hikerUser = { id: 1, email: 'hiker@example.test', role: 'HIKER' };
    stubApi({ '/api/auth/me': () => json(hikerUser) });
    renderAt('/unauthorized');

    expect(
      await screen.findByText(
        /signed in as hiker@example.test, but your account does not have permission/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Book a table/i })).toHaveAttribute('href', '/book');
  });

  it('shows staff area link when user is a staff member', async () => {
    const staffUser = { id: 2, email: 'staff@example.test', role: 'EMPLOYEE' };
    stubApi({ '/api/auth/me': () => json(staffUser) });
    renderAt('/unauthorized');

    expect(await screen.findByRole('link', { name: /Manage slots/i })).toHaveAttribute(
      'href',
      '/staff/slots',
    );
  });
});
