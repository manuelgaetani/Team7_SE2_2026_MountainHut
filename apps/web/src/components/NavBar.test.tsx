import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  // The account indicator of the bar, and the menu it opens.
  const accountButton = () => screen.findByRole('button', { name: 'Account menu' });
  async function openAccountMenu() {
    fireEvent.click(await accountButton());
  }

  it('shows the account indicator, not the email, to the user of the session', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    expect(await accountButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('opens the account menu with the email, the personal area and sign out', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    await openAccountMenu();
    expect(await accountButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(user.email)).toBeVisible();
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings');
    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute(
      'href',
      '/change-password',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('closes the account menu on Escape and on a link', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    const router = renderAt('/');
    await openAccountMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: 'My profile' })).not.toBeInTheDocument();

    await openAccountMenu();
    fireEvent.click(screen.getByRole('link', { name: 'Change password' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    expect(await accountButton()).toHaveAttribute('aria-expanded', 'false');
  });

  const navLinks = () =>
    within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent);

  it('lists availability, sign in and register for a visitor', async () => {
    stubApi();
    renderAt('/');
    await screen.findByRole('link', { name: 'Sign in' });
    expect(navLinks()).toEqual(['Mountain Hut', 'Availability', 'Sign in', 'Register']);
  });

  it('keeps availability visible on the auth pages, without the auth links', async () => {
    stubApi();
    renderAt('/login');
    expect(await screen.findByRole('link', { name: 'Availability' })).toHaveAttribute(
      'href',
      '/availability',
    );
    expect(
      within(screen.getByRole('navigation')).queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('gives a hiker the booking links', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/');
    await accountButton();
    // My bookings and Change password moved to the account menu and the profile page.
    expect(navLinks()).toEqual(['Mountain Hut', 'Book a table', 'Availability', 'Register a hike']);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Book a table' })).toHaveAttribute('href', '/book');
    expect(nav.queryByRole('link', { name: 'Change password' })).not.toBeInTheDocument();
  });

  it.each(['EMPLOYEE', 'WARDEN'])('gives a %s the staff links', async (role) => {
    stubApi({ '/api/auth/me': () => json({ ...user, role }) });
    renderAt('/');
    await accountButton();
    expect(navLinks()).toEqual(['Mountain Hut', 'Time slots', 'New booking']);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Time slots' })).toHaveAttribute('href', '/staff/slots');
    expect(nav.getByRole('link', { name: 'New booking' })).toHaveAttribute(
      'href',
      '/staff/bookings/new',
    );
    await openAccountMenu();
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change password' })).toBeVisible();
  });

  it('marks the link of the current page', async () => {
    stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/availability');
    const nav = within(screen.getByRole('navigation'));
    expect(await nav.findByRole('link', { name: 'Availability' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.getByRole('link', { name: 'Book a table' })).not.toHaveAttribute('aria-current');
  });

  it('keeps a user who must change the password on the change-password page', async () => {
    stubApi({ '/api/auth/me': () => json({ ...user, mustChangePassword: true }) });
    const router = renderAt('/change-password');
    fireEvent.click(
      await within(screen.getByRole('navigation')).findByRole('link', { name: 'Book a table' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });

  it('renews an expired session', async () => {
    stubApi({ '/api/auth/refresh': () => json(user) });
    renderAt('/');
    expect(await accountButton()).toBeInTheDocument();
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
    await openAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
  });

  it('takes the user back to the home page after signing out', async () => {
    // Like the real API: once signed out, the session is gone.
    let signedIn = true;
    stubApi({
      '/api/auth/me': () => (signedIn ? json(user) : json({}, 401)),
      '/api/auth/refresh': () => json({}, 401),
      '/api/auth/logout': () => {
        signedIn = false;
        return json({ message: 'Logged out' });
      },
    });
    const router = renderAt('/bookings');
    await openAccountMenu();
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Sign out' }));
    // Once signed out, the navigation bar offers to sign in again.
    expect(
      await within(screen.getByRole('banner')).findByRole('link', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // The user stays on the home page: the page left behind does not redirect them.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.pathname).toBe('/');
  });

  it('confirms the sign out with a toast', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/auth/logout': () => json({ message: 'Logged out' }),
    });
    renderAt('/');
    await openAccountMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'You have signed out. See you soon!',
    );
  });
});
