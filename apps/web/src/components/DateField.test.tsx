import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from './DateField.tsx';

function Harness({ initial = '2030-01-15', min }: { initial?: string; min?: string }) {
  const [value, setValue] = useState(initial);
  return <DateField id="day" label="Day" value={value} onChange={setValue} min={min} />;
}

const calendar = () => within(screen.getByRole('group', { name: 'Calendar' }));
const day = (name: string) => calendar().getByRole('button', { name });

describe('DateField', () => {
  it('shows the chosen day and opens the calendar of the site on it', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Day');
    expect(field).toHaveTextContent('Tue 15 Jan 2030');
    fireEvent.click(field);
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(day('Tue 15 Jan')).toHaveAttribute('aria-pressed', 'true');
    expect(day('Tue 15 Jan')).toHaveFocus();
  });

  it('picks a day, closes and gives the focus back to the field', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Day'));
    fireEvent.click(day('Mon 21 Jan'));
    expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Day')).toHaveTextContent('Mon 21 Jan 2030');
    expect(screen.getByLabelText('Day')).toHaveFocus();
  });

  it('disables the days before min and the months before it', () => {
    render(<Harness min="2030-01-10" />);
    fireEvent.click(screen.getByLabelText('Day'));
    expect(day('Wed 9 Jan')).toBeDisabled();
    expect(day('Thu 10 Jan')).toBeEnabled();
    expect(calendar().getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('has no limit without min', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Day'));
    expect(day('Tue 1 Jan')).toBeEnabled();
    fireEvent.click(calendar().getByRole('button', { name: 'Previous month' }));
    expect(calendar().getByText('December 2029')).toBeInTheDocument();
  });

  it('says to choose a date when there is none', () => {
    render(<Harness initial="" />);
    expect(screen.getByLabelText('Day')).toHaveTextContent('Choose a date');
  });

  it('marks an error and links it to the field', () => {
    render(<DateField id="d" label="Date" value="" onChange={vi.fn()} error="Choose a date." />);
    const field = screen.getByLabelText('Date');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Choose a date\./);
  });

  describe('keyboard', () => {
    it('moves by day and week with the arrows, and changes month when needed', () => {
      render(<Harness initial="2030-01-30" />);
      fireEvent.click(screen.getByLabelText('Day'));
      fireEvent.keyDown(day('Wed 30 Jan'), { key: 'ArrowRight' });
      expect(day('Thu 31 Jan')).toHaveFocus();
      fireEvent.keyDown(day('Thu 31 Jan'), { key: 'ArrowDown' });
      expect(calendar().getByText('February 2030')).toBeInTheDocument();
      expect(day('Thu 7 Feb')).toHaveFocus();
      fireEvent.keyDown(day('Thu 7 Feb'), { key: 'ArrowLeft' });
      expect(day('Wed 6 Feb')).toHaveFocus();
      fireEvent.keyDown(day('Wed 6 Feb'), { key: 'ArrowUp' });
      expect(day('Wed 30 Jan')).toHaveFocus();
    });

    it('skips the days that cannot be chosen and stops at min', () => {
      render(<Harness initial="2030-01-11" min="2030-01-10" />);
      fireEvent.click(screen.getByLabelText('Day'));
      fireEvent.keyDown(day('Fri 11 Jan'), { key: 'ArrowLeft' });
      expect(day('Thu 10 Jan')).toHaveFocus();
      fireEvent.keyDown(day('Thu 10 Jan'), { key: 'ArrowLeft' });
      expect(day('Thu 10 Jan')).toHaveFocus();
    });

    it('changes month with Page Up and Page Down', () => {
      render(<Harness />);
      fireEvent.click(screen.getByLabelText('Day'));
      fireEvent.keyDown(day('Tue 15 Jan'), { key: 'PageDown' });
      expect(calendar().getByText('February 2030')).toBeInTheDocument();
      expect(day('Fri 1 Feb')).toHaveFocus();
      fireEvent.keyDown(day('Fri 1 Feb'), { key: 'PageUp' });
      expect(day('Tue 1 Jan')).toHaveFocus();
    });

    it('closes on Escape and on a click outside', () => {
      render(
        <>
          <p>Outside</p>
          <Harness />
        </>,
      );
      fireEvent.click(screen.getByLabelText('Day'));
      fireEvent.keyDown(day('Tue 15 Jan'), { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Day')).toHaveFocus();
      fireEvent.click(screen.getByLabelText('Day'));
      fireEvent.mouseDown(screen.getByText('Outside'));
      expect(screen.queryByRole('group', { name: 'Calendar' })).not.toBeInTheDocument();
    });
  });
});
