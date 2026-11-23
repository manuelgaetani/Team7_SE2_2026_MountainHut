import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

describe('NotFoundPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders 404 information and action links', async () => {
    stubApi();
    renderAt('/non-existent-route');

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(
      within(main).getByText(/the trail you are following doesn't lead anywhere/i),
    ).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/');
    expect(await within(main).findByRole('link', { name: /Book a table/i })).toHaveAttribute(
      'href',
      '/book',
    );
  });

  it('offers a hiker to book a table', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/non-existent-route');
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('link', { name: /Book a table/i })).toHaveAttribute(
      'href',
      '/book',
    );
  });

  it.each(['EMPLOYEE', 'WARDEN'])('offers a %s only the way back home', async (role) => {
    stubApi({ '/api/auth/me': () => json({ ...user, role }) });
    renderAt('/non-existent-route');
    const main = screen.getByRole('main');
    // The navigation bar shows Sign out once the user is known.
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(
      within(main)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Back to home→']);
  });
});
