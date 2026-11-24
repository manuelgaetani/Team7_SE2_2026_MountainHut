import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, renderAt, sentBody, stubApi } from '../test/app.tsx';

const TEXT = {
  email: 'Email',
  submit: 'Send the link',
  invalidEmail: 'Enter a valid email address.',
  sent: 'If the email is registered, a link has been sent. It is valid for 24 hours.',
  failed: 'The request could not be sent. Please try again.',
  forgotLink: 'Forgot your password?',
} as const;

const URL = '/api/auth/password-reset/request';
const ANSWER = { message: 'If the email is registered, a reset link has been sent' };

const ask = (email: string) => {
  fireEvent.change(screen.getByLabelText(TEXT.email), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));
};

describe('ForgotPasswordPage (MH-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is linked from the login page', async () => {
    stubApi();
    renderAt('/login');

    expect(await screen.findByRole('link', { name: TEXT.forgotLink })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('does not send an invalid email', async () => {
    const fetchMock = stubApi();
    renderAt('/forgot-password');

    ask('mario');

    expect(await screen.findByText(TEXT.invalidEmail)).toBeVisible();
    expect(screen.getByLabelText(TEXT.email)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalledWith(URL, expect.anything());
  });

  it('sends the email and gives the same answer whoever is registered', async () => {
    const fetchMock = stubApi({ [URL]: () => json(ANSWER) });
    renderAt('/forgot-password');

    ask('mario.rossi@example.com');

    expect(await screen.findByRole('status')).toHaveTextContent(TEXT.sent);
    expect(sentBody(fetchMock, URL)).toEqual({ email: 'mario.rossi@example.com' });
  });

  it('tells when the request fails', async () => {
    stubApi({ [URL]: () => json({}, 500) });
    renderAt('/forgot-password');

    ask('mario.rossi@example.com');

    expect(await screen.findByText(TEXT.failed)).toBeVisible();
  });

  it('labels the page as the account area', () => {
    stubApi();
    renderAt('/forgot-password');
    expect(screen.getByText('Your account')).toBeVisible();
    expect(screen.queryByText('Personal area')).not.toBeInTheDocument();
  });
});
