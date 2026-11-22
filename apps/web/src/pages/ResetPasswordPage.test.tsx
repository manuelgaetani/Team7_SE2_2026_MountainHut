import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, sentBody, stubApi } from '../test/app.tsx';

const TEXT = {
  password: 'New password',
  submit: 'Set the new password',
  rules: 'Use at least 8 characters with a letter and a digit.',
  invalidLink: 'The link is invalid or has expired.',
  done: /Your password has been changed/,
  newLink: 'Ask for one',
} as const;

const URL = '/api/auth/password-reset/confirm';
const TOKEN = 'abc123';

const setPassword = (password: string) => {
  fireEvent.change(screen.getByLabelText(TEXT.password), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));
};

describe('ResetPasswordPage (MH-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tells that a link without a code is invalid', async () => {
    stubApi();
    renderAt('/reset-password');

    expect(await screen.findByText(TEXT.invalidLink)).toBeVisible();
    expect(screen.queryByLabelText(TEXT.password)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: TEXT.newLink })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('does not send a password that breaks the rules', async () => {
    const fetchMock = stubApi();
    renderAt(`/reset-password?token=${TOKEN}`);

    setPassword('onlyletters');

    expect(await screen.findByText(TEXT.rules)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalledWith(URL, expect.anything());
  });

  it('sets the new password with the code of the link', async () => {
    const fetchMock = stubApi({ [URL]: () => json({ message: 'Password changed' }) });
    renderAt(`/reset-password?token=${TOKEN}`);

    setPassword('MyOwnPassword1');

    const done = await screen.findByRole('status');
    expect(done).toHaveTextContent(TEXT.done);
    expect(within(done).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(sentBody(fetchMock, URL)).toEqual({ token: TOKEN, password: 'MyOwnPassword1' });
  });

  it('explains an expired or used link', async () => {
    stubApi({ [URL]: () => json({ message: 'The link is invalid or has expired' }, 422) });
    renderAt(`/reset-password?token=${TOKEN}`);

    setPassword('MyOwnPassword1');

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.invalidLink);
  });
});
