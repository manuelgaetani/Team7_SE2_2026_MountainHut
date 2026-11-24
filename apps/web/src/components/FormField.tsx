import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | undefined;
  /** Always-visible help under the input, linked to it for screen readers. */
  hint?: string;
}

export function FormField({ id, label, error, hint, ...inputProps }: FormFieldProps) {
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
        {...inputProps}
      />
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
