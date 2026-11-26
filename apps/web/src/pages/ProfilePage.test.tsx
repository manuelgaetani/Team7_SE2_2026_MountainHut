import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hikerProfile, json, renderAt, stubApi, user } from '../test/app.tsx';

const asHiker = (myProfile: () => Response = () => json(hikerProfile)) =>
  stubApi({
    '/api/auth/me': () => json(user),
    '/api/hikers/me': myProfile,
    '/api/bookings/me': () => json([]),
    '/api/hikes/mine': () => json([]),
  });

const details = async () => within(await screen.findByRole('region', { name: 'My profile' }));
const sideMenu = () => within(screen.getByRole('navigation', { name: 'Personal area' }));

describe('ProfilePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends visitors without a session to the page for visitors not signed in', async () => {
    stubApi();
    const router = renderAt('/profile');
    await waitFor(() => expect(router.state.location.pathname).toBe('/unauthorized'));
  });

  it('shows the name, email and phone of the hiker', async () => {
    asHiker(() => json({ ...hikerProfile, phone: '3331234567' }));
    renderAt('/profile');
    const box = await details();
    expect(await box.findByText('Mario Rossi')).toBeVisible();
    expect(box.getByText(user.email)).toBeVisible();
    expect(box.getByText('3331234567')).toBeVisible();
  });

  it('says "Not provided" for an optional detail left empty', async () => {
    asHiker();
    renderAt('/profile');
    expect(await (await details()).findByText('Not provided')).toBeVisible();
  });

  it('shows a loading status while the profile arrives', async () => {
    asHiker();
    renderAt('/profile');
    expect(await (await details()).findByRole('status')).toHaveTextContent('Loading your profile…');
  });

  it('shows an error when the profile cannot be loaded', async () => {
    asHiker(() => json({ message: 'Server error' }, 500));
    renderAt('/profile');
    expect(await (await details()).findByRole('alert')).toHaveTextContent(
      'Your profile could not be loaded.',
    );
  });

  it('shows email and role to a staff account, without asking for a hiker profile', async () => {
    const fetchMock = stubApi({ '/api/auth/me': () => json({ ...user, role: 'WARDEN' }) });
    renderAt('/profile');
    const box = await details();
    expect(box.getByText(user.email)).toBeVisible();
    expect(box.getByText('Hut warden')).toBeVisible();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/hikers/me');
    expect(sideMenu().queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument();
    expect(sideMenu().queryByRole('link', { name: 'My hikes' })).not.toBeInTheDocument();
  });

  it('links the bookings and the password change from the side menu', async () => {
    asHiker();
    const router = renderAt('/profile');
    await details();
    expect(sideMenu().getByRole('link', { name: 'My profile' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    fireEvent.click(sideMenu().getByRole('link', { name: 'My bookings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/bookings'));
    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeVisible();

    fireEvent.click(sideMenu().getByRole('link', { name: 'My hikes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hikes'));
    expect(await screen.findByRole('heading', { name: 'My hikes' })).toBeVisible();

    fireEvent.click(sideMenu().getByRole('link', { name: 'Change password' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    expect(screen.getByLabelText('Current password')).toBeVisible();
  });

  it('signs out from the side menu and says so', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/auth/logout': () => json({ message: 'Logged out' }),
    });
    const router = renderAt('/profile');
    await details();
    fireEvent.click(sideMenu().getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'You have signed out. See you soon!',
    );
    expect(router.state.location.pathname).toBe('/');
  });
});
