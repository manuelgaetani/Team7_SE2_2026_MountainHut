import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { changePasswordSchema } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useChangePassword, useCurrentUser } from '../api/useAuth.ts';
import { FormField } from '../components/FormField.tsx';

type Errors = Partial<Record<'currentPassword' | 'newPassword', string>>;

const PASSWORD_RULES = 'Use at least 8 characters with a letter and a digit.';

function changeError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  if (e instanceof ApiError && e.status === 403) return 'The current password is wrong.';
  if (e instanceof ApiError && e.status === 422) {
    return 'Choose a password different from the current one.';
  }
  return 'The password could not be changed. Please try again.';
}

function ChangePasswordForm({ forced }: { forced: boolean }) {
  const navigate = useNavigate();
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        found[field] ??= field === 'newPassword' ? PASSWORD_RULES : 'Enter your current password.';
      }
      setErrors(found);
      return;
    }

    changePassword.mutate(parsed.data, {
      onSuccess: () => setDone(true),
      onError: (err) => setFormError(changeError(err)),
    });
  }

  if (done) {
    return (
      <>
        <p role="status" className="notice notice--ok">
          Your password has been changed.
        </p>
        <button type="button" className="button-primary" onClick={() => void navigate('/')}>
          <span>Continue</span>
          <span aria-hidden="true">→</span>
        </button>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {forced && (
        <p className="notice notice--ok">
          Your account was created by the hut staff. Replace the temporary password with one of your
          own to continue.
        </p>
      )}
      <FormField
        id="currentPassword"
        label={forced ? 'Temporary password' : 'Current password'}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={errors.currentPassword}
      />
      <FormField
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={errors.newPassword}
      />
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={changePassword.isPending}>
        <span>{changePassword.isPending ? 'Saving…' : 'Change password'}</span>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

// MH-07: any logged-in user changes the password. An account created by the staff is sent here
// until the generated password is replaced.
export function ChangePasswordPage() {
  const { data: user, isPending } = useCurrentUser();

  let content;
  if (isPending) {
    content = <p role="status">Checking credentials…</p>;
  } else if (!user) {
    content = (
      <p className="notice notice--ok">
        <Link to="/login">Log in</Link> to change your password.
      </p>
    );
  } else {
    content = <ChangePasswordForm forced={user.mustChangePassword} />;
  }

  return (
    <section className="auth auth--large">
      <p className="eyebrow">Personal area</p>
      <h1>Change password.</h1>
      {content}
    </section>
  );
}
