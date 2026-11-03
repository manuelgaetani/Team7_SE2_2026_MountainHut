import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayPicker } from './DayPicker.tsx';

describe('DayPicker', () => {
  it('renders radio buttons for dates and triggers onChange when clicked', () => {
    const onChange = vi.fn();
    const dates = ['2030-01-15', '2030-01-16'];

    render(<DayPicker dates={dates} value="2030-01-15" onChange={onChange} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(radios[1]);
    expect(onChange).toHaveBeenCalledWith('2030-01-16');
  });

  it('renders empty radiogroup when dates is empty', () => {
    const onChange = vi.fn();
    render(<DayPicker dates={[]} value="2030-01-15" onChange={onChange} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
