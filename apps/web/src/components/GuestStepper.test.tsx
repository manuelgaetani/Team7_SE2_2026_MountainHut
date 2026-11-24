import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuestStepper } from './GuestStepper.tsx';

describe('GuestStepper', () => {
  it('has no upper bound when max is undefined', () => {
    render(<GuestStepper value={99} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'More guests' })).toBeEnabled();
  });

  it('disables More guests at max and Fewer guests at the minimum', () => {
    render(<GuestStepper value={1} max={1} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'More guests' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fewer guests' })).toBeDisabled();
  });

  it('calls onChange with the new value', () => {
    const onChange = vi.fn();
    render(<GuestStepper value={2} max={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'More guests' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fewer guests' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('labels the value with the default label and shows the default hint', () => {
    render(<GuestStepper value={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText('How many people are in your party?')).toHaveTextContent('3');
    expect(screen.getByText('Children included')).toBeInTheDocument();
  });

  it('accepts a custom label and hides the hint when null', () => {
    render(<GuestStepper value={3} onChange={vi.fn()} label="Party size" hint={null} />);
    expect(screen.getByLabelText('Party size')).toHaveTextContent('3');
    expect(screen.queryByText('Children included')).not.toBeInTheDocument();
  });
});
