import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SlotSummary } from '@mountain-hut/shared';
import { isBookable, TimeSlotPicker } from './TimeSlotPicker.tsx';

const sampleSlots: SlotSummary[] = [
  {
    id: 1,
    date: '2030-01-15',
    startTime: '12:00',
    endTime: '14:00',
    freeSeats: 4,
    availability: 'AVAILABLE',
  },
  {
    id: 2,
    date: '2030-01-15',
    startTime: '19:00',
    endTime: '21:00',
    freeSeats: 1,
    availability: 'AVAILABLE',
  },
  {
    id: 3,
    date: '2030-01-15',
    startTime: '21:00',
    endTime: '23:00',
    freeSeats: 0,
    availability: 'FULL',
  },
  {
    id: 4,
    date: '2030-01-15',
    startTime: '10:00',
    endTime: '11:00',
    freeSeats: 2,
    availability: 'TOO_LATE',
  },
];

describe('TimeSlotPicker', () => {
  it('renders without time range meta when slots array is empty', () => {
    const onChange = vi.fn();
    render(<TimeSlotPicker slots={[]} guests={2} value={null} onChange={onChange} />);

    expect(screen.queryByText(/Lunch/)).not.toBeInTheDocument();
  });

  it('renders time range and slots, and handles slot selection', () => {
    const onChange = vi.fn();
    render(<TimeSlotPicker slots={sampleSlots} guests={2} value={1} onChange={onChange} />);

    expect(screen.queryByText(/Lunch/)).not.toBeInTheDocument();
    expect(screen.getByText('12:00–11:00')).toBeInTheDocument();
    expect(screen.getByText(/A table is waiting for you at 12:00/)).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);

    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toBeEnabled();

    // slot 2 has 1 seat, guests is 2 -> disabled
    expect(radios[1]).toBeDisabled();

    // slot 3 is FULL -> disabled
    expect(radios[2]).toBeDisabled();

    // slot 4 is TOO_LATE -> disabled, no title
    expect(radios[3]).toBeDisabled();
    expect(radios[3]).not.toHaveAttribute('title');

    // Clicking enabled radio triggers onChange
    fireEvent.click(radios[0]);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('isBookable correctly determines bookability', () => {
    expect(isBookable(sampleSlots[0], 2)).toBe(true);
    expect(isBookable(sampleSlots[0], 5)).toBe(false);
    expect(isBookable(sampleSlots[2], 0)).toBe(false);
    expect(isBookable(sampleSlots[3], 1)).toBe(false);
  });

  it('shows the range and the reason on each slot', () => {
    render(<TimeSlotPicker slots={sampleSlots} guests={3} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /^12:00–14:00/ })).not.toHaveTextContent(
      /Only|Full|Closed/,
    );
    expect(screen.getByRole('radio', { name: /^19:00–21:00/ })).toHaveTextContent('Only 1 seat');
    expect(screen.getByRole('radio', { name: /^21:00–23:00/ })).toHaveTextContent('Full');
    expect(screen.getByRole('radio', { name: /^10:00–11:00/ })).toHaveTextContent('Closed');
  });

  it('shows Only n seats when fewer seats than guests', () => {
    render(
      <TimeSlotPicker
        slots={[{ ...sampleSlots[0], freeSeats: 2 }]}
        guests={3}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio')).toHaveTextContent('Only 2 seats');
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  it('lets canChoose and reason override the defaults', () => {
    render(
      <TimeSlotPicker
        slots={[sampleSlots[2]]}
        guests={1}
        value={null}
        onChange={vi.fn()}
        canChoose={() => true}
        reason={() => null}
        label="Pick one"
      />,
    );
    expect(screen.getByRole('radio')).toBeEnabled();
    expect(screen.getByRole('radio')).not.toHaveTextContent('Full');
    expect(screen.getByRole('radiogroup', { name: 'Pick one' })).toBeInTheDocument();
  });

  it('names the radiogroup What time? by default', () => {
    render(<TimeSlotPicker slots={sampleSlots} guests={1} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'What time?' })).toBeInTheDocument();
  });

  describe('list of the times', () => {
    const openList = () =>
      fireEvent.click(
        screen.getByRole('button', { name: '12:00–11:00, choose a time from the list' }),
      );
    const list = () => within(screen.getByRole('group', { name: 'Times' }));

    it('opens from the range button, in order of time, focused on the chosen time', () => {
      render(<TimeSlotPicker slots={sampleSlots} guests={1} value={2} onChange={vi.fn()} />);
      expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument();
      openList();
      const toggle = screen.getByRole('button', { name: /choose a time from the list/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const times = list().getAllByRole('button');
      expect(times.map((b) => b.getAttribute('aria-label'))).toEqual([
        '10:00–11:00, Closed',
        '12:00–14:00',
        '19:00–21:00',
        '21:00–23:00, Full',
      ]);
      expect(list().getByRole('button', { name: '19:00–21:00' })).toHaveFocus();
      expect(list().getByRole('button', { name: '19:00–21:00' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(list().getByRole('button', { name: '21:00–23:00, Full' })).toBeDisabled();
    });

    it('picks a time, closes and gives the focus back to the button', () => {
      const onChange = vi.fn();
      render(<TimeSlotPicker slots={sampleSlots} guests={1} value={null} onChange={onChange} />);
      openList();
      fireEvent.click(list().getByRole('button', { name: '19:00–21:00' }));
      expect(onChange).toHaveBeenCalledWith(2);
      expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /choose a time from the list/ })).toHaveFocus();
    });

    it('moves with the arrows between the times that can be chosen, and closes on Escape', () => {
      render(<TimeSlotPicker slots={sampleSlots} guests={1} value={null} onChange={vi.fn()} />);
      openList();
      const first = list().getByRole('button', { name: '12:00–14:00' });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: 'ArrowRight' });
      expect(list().getByRole('button', { name: '19:00–21:00' })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(list().getByRole('button', { name: '19:00–21:00' })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'Home' });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: 'Escape' });
      expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /choose a time from the list/ })).toHaveFocus();
    });

    it('closes on a click outside', () => {
      render(<TimeSlotPicker slots={sampleSlots} guests={1} value={null} onChange={vi.fn()} />);
      openList();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('group', { name: 'Times' })).not.toBeInTheDocument();
    });

    it('has no button when there are no times', () => {
      render(<TimeSlotPicker slots={[]} guests={1} value={null} onChange={vi.fn()} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
