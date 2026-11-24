import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, sentBody, stubApi, user } from '../test/app.tsx';

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the API with an invalid email', () => {
    const fetchMock = stubApi();
    renderAt('/login');
    fill('not-an-email', 'secret');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });

  it('signs in, shows the session and goes to the home page', async () => {
    const fetchMock = stubApi({ '/api/auth/login': () => json(user) });
    const router = renderAt('/login');
    // Wait for the background auth check to settle so its refresh response does not overwrite the login.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.anything()),
    );
    fill(user.email, 'secret');
    submit();
    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(sentBody(fetchMock, '/api/auth/login')).toEqual({
      email: user.email,
      password: 'secret',
    });
  });

  it('explains wrong credentials', async () => {
    stubApi({ '/api/auth/login': () => json({}, 401) });
    renderAt('/login');
    fill(user.email, 'wrong');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('shows a generic error for any other failure', async () => {
    stubApi({ '/api/auth/login': () => json({}, 500) });
    renderAt('/login');
    fill(user.email, 'secret');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in failed');
  });

  it('redirects to the safe next path after signing in and preserves next on register links', async () => {
    const next = '/book?date=2030-01-15&time=19%3A00&partySize=3';
    const fetchMock = stubApi({
      '/api/auth/login': () => json(user),
      '/api/slots': () => json([]),
    });
    const router = renderAt(`/login?next=${encodeURIComponent(next)}`);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.anything()),
    );

    const registerLinks = screen.getAllByRole('link', { name: 'Register' });
    for (const link of registerLinks) {
      expect(link).toHaveAttribute('href', `/register?${new URLSearchParams({ next }).toString()}`);
    }

    fill(user.email, 'secret');
    submit();
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(next),
    );
  });

  it('ignores an unsafe external next query param and goes to home after signing in', async () => {
    const fetchMock = stubApi({ '/api/auth/login': () => json(user) });
    const router = renderAt('/login?next=https%3A%2F%2Fevil.example');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.anything()),
    );

    fill(user.email, 'secret');
    submit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('shows that the request is running', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchMock = stubApi();
    fetchMock.mockImplementation((url: string) =>
      url === '/api/auth/login'
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.resolve(json({}, 401)),
    );
    renderAt('/login');
    fill(user.email, 'secret');
    submit();
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    answer(json({}, 401));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('welcomes the user back with a toast', async () => {
    const fetchMock = stubApi({ '/api/auth/login': () => json(user) });
    renderAt('/login');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.anything()),
    );
    fill(user.email, 'secret');
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent('Welcome back.');
  });

  it('labels the page as the account area', () => {
    stubApi();
    renderAt('/login');
    expect(screen.getByText('Your account')).toBeVisible();
    expect(screen.queryByText('Personal area')).not.toBeInTheDocument();
  });
});
