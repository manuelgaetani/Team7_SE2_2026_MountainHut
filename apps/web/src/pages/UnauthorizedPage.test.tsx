import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, stubApi } from '../test/app.tsx';

describe('UnauthorizedPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prompts unauthenticated visitors to sign in', async () => {
    stubApi();
    renderAt('/unauthorized');

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
    expect(
      await within(main).findByText(/must be signed in with an authorized staff account/i),
    ).toBeInTheDocument();
    expect(await within(main).findByRole('link', { name: /Sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(within(main).getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
  });

  it('displays user email and hiker restriction when signed in as a hiker', async () => {
    const hikerUser = { id: 1, email: 'hiker@example.test', role: 'HIKER' };
    stubApi({ '/api/auth/me': () => json(hikerUser) });
    renderAt('/unauthorized');

    const main = screen.getByRole('main');
    expect(
      await within(main).findByText(
        /signed in as hiker@example.test, but your account does not have permission/i,
      ),
    ).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Book a table/i })).toHaveAttribute(
      'href',
      '/book',
    );
  });

  it('shows staff area link when user is a staff member', async () => {
    const staffUser = { id: 2, email: 'staff@example.test', role: 'EMPLOYEE' };
    stubApi({ '/api/auth/me': () => json(staffUser) });
    renderAt('/forbidden');

    const main = screen.getByRole('main');
    expect(await within(main).findByRole('link', { name: /Manage slots/i })).toHaveAttribute(
      'href',
      '/staff/slots',
    );
  });
});
