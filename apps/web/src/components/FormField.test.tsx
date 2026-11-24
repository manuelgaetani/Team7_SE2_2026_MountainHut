import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './FormField.tsx';

describe('FormField', () => {
  it('shows and hides a password with the eye button', () => {
    render(<FormField id="pw" label="Password" type="password" defaultValue="secret1" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('has no eye button on other inputs', () => {
    render(<FormField id="email" label="Email" type="email" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
