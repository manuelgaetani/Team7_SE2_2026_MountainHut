import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { loginSchema } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useLogin } from '../api/useAuth.ts';
import { AuthTabs } from '../components/AuthTabs.tsx';
import { FormField } from '../components/FormField.tsx';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Enter a valid email address and your password.');
      return;
    }

    login.mutate(parsed.data, {
      onSuccess: () => {
        void navigate('/');
      },
      onError: (e) => {
        setError(
          e instanceof ApiError && e.status === 401
            ? 'Incorrect email or password.'
            : 'Sign in failed. Please try again.',
        );
      },
    });
  }

  return (
    <section className="auth">
      <p className="eyebrow">Personal area</p>
      <h1>Welcome back.</h1>
      <p className="auth-subtitle">Sign in to manage your bookings.</p>
      <AuthTabs />
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={login.isPending}>
          <span>{login.isPending ? 'Signing in…' : 'Sign in'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
      <p className="auth-switch">
        Don't have an account? <Link to="/register">Register</Link>
      </p>
    </section>
  );
}
