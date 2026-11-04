import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerSchema } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useRegister } from '../api/useAuth.ts';
import { AuthTabs } from '../components/AuthTabs.tsx';
import { FormField } from '../components/FormField.tsx';

type Errors = Partial<Record<string, string>>;

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Enter a valid email address.',
  password: 'Use at least 8 characters with a letter and a digit.',
  fullName: 'Enter your full name (it must contain a letter).',
  phone: 'Enter 7 to 15 digits. Spaces, dashes and a leading + are allowed.',
  notes: 'The notes are not valid.',
  emergencyContact: 'The emergency contact is not valid.',
};

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = registerSchema.safeParse({
      email,
      password,
      fullName,
      phone,
      notes: notes || undefined,
      emergencyContact: emergencyContact || undefined,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        found[field] ??= FIELD_MESSAGES[field] ?? 'Invalid value.';
      }
      setErrors(found);
      return;
    }

    register.mutate(parsed.data, {
      onSuccess: () => {
        void navigate('/login');
      },
      onError: (e) => {
        setFormError(
          e instanceof ApiError && e.status === 409
            ? 'An account with this email already exists.'
            : 'Registration failed. Please try again.',
        );
      },
    });
  }

  return (
    <section className="auth">
      <p className="eyebrow">Join us</p>
      <h1>Start here.</h1>
      <p className="auth-subtitle">Create your Mountain Hut profile.</p>
      <AuthTabs />
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="fullName"
          label="Full name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <FormField
          id="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <FormField
          id="emergencyContact"
          label="Emergency contact (optional)"
          value={emergencyContact}
          onChange={(e) => setEmergencyContact(e.target.value)}
          error={errors.emergencyContact}
        />
        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {errors.notes && (
            <p role="alert" className="field-error">
              {errors.notes}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={register.isPending}>
          <span>{register.isPending ? 'Registering…' : 'Register'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
