import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PASSWORD_RESET_TTL_HOURS, requestPasswordResetSchema } from '@mountain-hut/shared';
import { useRequestPasswordReset } from '../api/useAuth.ts';
import { FormField } from '../components/FormField.tsx';

// MH-07: asks for a link to set a new password. The answer is the same for an unknown email,
// so the page does not reveal who is registered.
export function ForgotPasswordPage() {
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = requestPasswordResetSchema.safeParse({ email });
    if (!parsed.success) {
      setError('Enter a valid email address.');
      return;
    }

    requestReset.mutate(parsed.data, {
      onError: () => setError('The request could not be sent. Please try again.'),
    });
  }

  return (
    <section className="auth">
      <p className="eyebrow">Personal area</p>
      <h1>Forgot your password?</h1>
      <p className="auth-subtitle">We will send you a link to set a new one.</p>
      {requestReset.isSuccess ? (
        <p role="status" className="notice notice--ok">
          If the email is registered, a link has been sent. It is valid for{' '}
          {PASSWORD_RESET_TTL_HOURS} hours.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
          />
          <button type="submit" className="button-primary" disabled={requestReset.isPending}>
            <span>{requestReset.isPending ? 'Sending…' : 'Send the link'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>
      )}
      <p className="auth-switch">
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
