import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeField } from './TimeField.tsx';

function Harness({
  initial = '',
  onChange = vi.fn(),
}: {
  initial?: string;
  onChange?: (t: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimeField
        id="time"
        label="Time"
        value={value}
        onChange={(t) => {
          setValue(t);
          onChange(t);
        }}
      />
      <button type="button">Outside</button>
    </>
  );
}

const toggle = () => screen.getByRole('button', { name: 'Choose hour and minutes' });
const panel = () => within(screen.getByRole('group', { name: 'Hour and minutes' }));

describe('TimeField', () => {
  it('takes any time typed by hand and writes it as HH:MM when the field is left', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Time');
    fireEvent.change(input, { target: { value: '1940' } });
    expect(input).toHaveValue('1940');
    fireEvent.blur(input);
    expect(input).toHaveValue('19:40');
  });

  it('opens the hours and minutes from the clock, on the chosen time', () => {
    render(<Harness initial="19:40" />);
    expect(screen.queryByRole('group', { name: 'Hour and minutes' })).not.toBeInTheDocument();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const hour = panel().getByRole('button', { name: '19 hours' });
    expect(hour).toHaveAttribute('aria-pressed', 'true');
    expect(hour).toHaveFocus();
    expect(panel().getByRole('button', { name: '40 minutes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('chooses the hour, then the minutes, closes and gives the focus back', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(toggle());
    fireEvent.click(panel().getByRole('button', { name: '20 hours' }));
    expect(onChange).toHaveBeenLastCalledWith('20:00');
    expect(panel().getByRole('button', { name: '00 minutes' })).toHaveFocus();
    fireEvent.click(panel().getByRole('button', { name: '15 minutes' }));
    expect(onChange).toHaveBeenLastCalledWith('20:15');
    expect(screen.getByLabelText('Time')).toHaveValue('20:15');
    expect(screen.queryByRole('group', { name: 'Hour and minutes' })).not.toBeInTheDocument();
    expect(toggle()).toHaveFocus();
  });

  it('keeps a typed minute that is not in the list when the hour changes', () => {
    const onChange = vi.fn();
    render(<Harness initial="12:37" onChange={onChange} />);
    fireEvent.click(toggle());
    fireEvent.click(panel().getByRole('button', { name: '13 hours' }));
    expect(onChange).toHaveBeenLastCalledWith('13:37');
  });

  it('moves with the arrows in and between the columns, and closes on Escape', () => {
    render(<Harness initial="10:30" />);
    fireEvent.click(toggle());
    const ten = panel().getByRole('button', { name: '10 hours' });
    fireEvent.keyDown(ten, { key: 'ArrowDown' });
    expect(panel().getByRole('button', { name: '11 hours' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(panel().getByRole('button', { name: '30 minutes' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(panel().getByRole('button', { name: '55 minutes' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Hour and minutes' })).not.toBeInTheDocument();
    expect(toggle()).toHaveFocus();
  });

  it('closes on a click outside', () => {
    render(<Harness />);
    fireEvent.click(toggle());
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('group', { name: 'Hour and minutes' })).not.toBeInTheDocument();
  });
});
