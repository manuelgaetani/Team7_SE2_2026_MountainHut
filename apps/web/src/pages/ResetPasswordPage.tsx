import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { confirmPasswordResetSchema } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useConfirmPasswordReset } from '../api/useAuth.ts';
import { FormField } from '../components/FormField.tsx';
import { PASSWORD_HINT } from '../lib/passwordRules.ts';

const PASSWORD_RULES = 'Use at least 8 characters with a letter and a digit.';
const INVALID_LINK = 'The link is invalid or has expired.';

// MH-07: the page opened from the reset email, /reset-password?token=<code>.
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const confirmReset = useConfirmPasswordReset();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    setFormError(null);

    const parsed = confirmPasswordResetSchema.safeParse({ token, password });
    if (!parsed.success) {
      setFieldError(PASSWORD_RULES);
      return;
    }

    confirmReset.mutate(parsed.data, {
      onError: (err) =>
        setFormError(
          err instanceof ApiError && err.status === 422
            ? INVALID_LINK
            : 'The password could not be changed. Please try again.',
        ),
    });
  }

  let content;
  if (token === '') {
    content = <p className="notice notice--error">{INVALID_LINK}</p>;
  } else if (confirmReset.isSuccess) {
    content = (
      <p role="status" className="notice notice--ok">
        Your password has been changed. <Link to="/login">Sign in</Link> with the new password.
      </p>
    );
  } else {
    content = (
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError ?? undefined}
        />
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={confirmReset.isPending}>
          <span>{confirmReset.isPending ? 'Saving…' : 'Set the new password'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
    );
  }

  return (
    <section className="auth auth--large">
      <p className="eyebrow">Your account</p>
      <h1>Set a new password.</h1>
      {content}
      {!confirmReset.isSuccess && (
        <p className="auth-switch">
          Need a new link? <Link to="/forgot-password">Ask for one</Link>
        </p>
      )}
    </section>
  );
}
