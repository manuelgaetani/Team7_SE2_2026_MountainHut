import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerSchema } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useRegister } from '../api/useAuth.ts';
import { FormField } from '../components/FormField.tsx';

type Errors = Partial<Record<string, string>>;

const FIELD_MESSAGES: Record<string, string> = {
  email: 'Enter a valid email address.',
  password: 'The password must be at least 8 characters (maximum 72 bytes).',
  fullName: 'Full name is required.',
  phone: 'Phone number is required.',
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
    <section>
      <h1>Register</h1>
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
        <div>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {errors.notes && <p role="alert">{errors.notes}</p>}
        </div>
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Registering…' : 'Register'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
