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

  it('signs in, shows the user and goes to the home page', async () => {
    const fetchMock = stubApi({ '/api/auth/login': () => json(user) });
    const router = renderAt('/login');
    // The session check of the navigation bar must end first: its answer would replace the user.
    await screen.findByRole('link', { name: 'Sign in' });
    fill(user.email, 'secret');
    submit();
    expect(await screen.findByText(user.email)).toBeInTheDocument();
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
});
