import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, sentBody, stubApi } from '../test/app.tsx';

const TEXT = {
  title: 'Change password',
  current: 'Current password',
  temporary: 'Temporary password',
  newPassword: 'New password',
  submit: 'Change password',
  forced: /Your account was created by the hut staff/,
  done: 'Your password has been changed.',
  rules: 'Use at least 8 characters with a letter and a digit.',
  wrongCurrent: 'The current password is wrong.',
  samePassword: 'Choose a password different from the current one.',
  sessionExpired: 'The session has expired. Please sign in again.',
} as const;

const URL = '/api/auth/change-password';

const hiker = { id: 1, email: 'hiker@example.test', role: 'HIKER', mustChangePassword: false };
const staffCreated = { ...hiker, mustChangePassword: true };

const fill = (current: string, next: string, currentLabel: string = TEXT.current) => {
  fireEvent.change(screen.getByLabelText(currentLabel), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(TEXT.newPassword), { target: { value: next } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

describe('ChangePasswordPage (MH-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks anonymous visitors to sign in', async () => {
    stubApi();
    renderAt('/change-password');

    expect(await screen.findByText(/to change your password/)).toBeVisible();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows the loading state while the session is checked', () => {
    stubApi({ '/api/auth/me': () => json(hiker) });
    renderAt('/change-password');

    expect(screen.getByText('Checking credentials…')).toBeVisible();
  });

  it('sends a staff-created account here from any page', async () => {
    stubApi({ '/api/auth/me': () => json(staffCreated) });
    const router = renderAt('/book');

    expect(await screen.findByText(TEXT.forced)).toBeVisible();
    expect(router.state.location.pathname).toBe('/change-password');
    expect(screen.getByLabelText(TEXT.temporary)).toBeVisible();
  });

  it('does not send the request when the new password breaks the rules', async () => {
    const fetchMock = stubApi({ '/api/auth/me': () => json(hiker) });
    renderAt('/change-password');
    await screen.findByLabelText(TEXT.current);

    fill('k7mq-x3tz-9pwa', 'short');
    submit();

    expect(await screen.findByText(TEXT.rules)).toBeVisible();
    expect(screen.getByLabelText(TEXT.newPassword)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalledWith(URL, expect.anything());
  });

  it('replaces the generated password and lets the user continue', async () => {
    const fetchMock = stubApi({
      '/api/auth/me': () => json(staffCreated),
      [URL]: () => json({ ...staffCreated, mustChangePassword: false }),
    });
    const router = renderAt('/change-password');
    await screen.findByLabelText(TEXT.temporary);

    fill('k7mq-x3tz-9pwa', 'MyOwnPassword1', TEXT.temporary);
    submit();

    expect(await screen.findByText(TEXT.done)).toBeVisible();
    expect(sentBody(fetchMock, URL)).toEqual({
      currentPassword: 'k7mq-x3tz-9pwa',
      newPassword: 'MyOwnPassword1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it.each([
    [403, TEXT.wrongCurrent],
    [422, TEXT.samePassword],
    [401, TEXT.sessionExpired],
  ])('explains an answer %i of the API', async (status, message) => {
    stubApi({ '/api/auth/me': () => json(hiker), [URL]: () => json({}, status) });
    renderAt('/change-password');
    await screen.findByLabelText(TEXT.current);

    fill('OldPassword1', 'MyOwnPassword1');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows the password rules before submitting', async () => {
    stubApi({ '/api/auth/me': () => json(hiker) });
    renderAt('/change-password');
    await screen.findByLabelText(TEXT.current);
    expect(screen.getByText('At least 8 characters, with a letter and a digit.')).toBeVisible();
    expect(screen.getByLabelText(TEXT.newPassword)).toHaveAccessibleDescription(
      'At least 8 characters, with a letter and a digit.',
    );
    expect(screen.getByText('Your account')).toBeVisible();
  });

  it('confirms a voluntary change with a toast and goes home', async () => {
    stubApi({
      '/api/auth/me': () => json(hiker),
      [URL]: () => json(hiker),
    });
    const router = renderAt('/change-password');
    await screen.findByLabelText(TEXT.current);

    fill('OldPassword1', 'MyOwnPassword1');
    submit();

    expect(await screen.findByRole('status')).toHaveTextContent(TEXT.done);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });
});
