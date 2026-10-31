import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | undefined;
}

export function FormField({ id, label, error, ...inputProps }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} {...inputProps} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
