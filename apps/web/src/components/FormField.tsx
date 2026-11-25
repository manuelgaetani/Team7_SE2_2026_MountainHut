import { useState, type InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | undefined;
  /** Always-visible help under the input, linked to it for screen readers. */
  hint?: string;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {!open && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  );
}

export function FormField({ id, label, error, hint, type, ...inputProps }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);

  const input = (
    <input
      id={id}
      type={isPassword && visible ? 'text' : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={hint ? hintId : undefined}
      {...inputProps}
    />
  );

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isPassword ? (
        // The eye shows what has been typed, so a mistake is seen before sending.
        <div className="field__password">
          {input}
          <button
            type="button"
            className="field__reveal"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((v) => !v)}
          >
            <EyeIcon open={visible} />
          </button>
        </div>
      ) : (
        input
      )}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
