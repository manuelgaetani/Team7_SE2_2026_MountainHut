import { fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByText(/Lunch ·/)).toBeInTheDocument();
    expect(screen.getByText(/A table is waiting for you at 12:00/)).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);

    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toBeEnabled();

    // slot 2 has 1 seat, guests is 2 -> disabled
    expect(radios[1]).toBeDisabled();

    // slot 3 is FULL -> disabled
    expect(radios[2]).toBeDisabled();

    // slot 4 is TOO_LATE -> disabled with title
    expect(radios[3]).toBeDisabled();
    expect(radios[3]).toHaveAttribute('title', 'Bookings closed for this time slot');

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
});
