import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FloorGroup } from '@mountain-hut/shared';
import { FloorGroups } from './FloorGroups.tsx';

const slot = { id: 5, date: '2026-11-14', startTime: '12:30', endTime: '13:30' };

const group = (overrides: Partial<FloorGroup> = {}): FloorGroup => ({
  label: 'A',
  bookingId: 1,
  fullName: 'Rossi',
  partySize: 4,
  status: 'CONFIRMED',
  startTime: '12:30',
  endTime: '13:30',
  tables: [{ tableNumber: 1, seats: 4 }],
  ...overrides,
});

const split = group({
  label: 'B',
  bookingId: 2,
  fullName: 'Ferrari',
  partySize: 8,
  tables: [
    { tableNumber: 4, seats: 6 },
    { tableNumber: 5, seats: 2 },
  ],
});

describe('FloorGroups', () => {
  it('says every seat is free when there are no groups', () => {
    render(<FloorGroups groups={[]} slot={slot} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('No bookings yet: every seat is free.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists the letter, the name, the people and the tables of each group', () => {
    render(
      <FloorGroups groups={[group(), split]} slot={slot} selected={null} onSelect={() => {}} />,
    );
    const rossi = screen.getByRole('button', { name: 'Group A, Rossi' });
    expect(rossi).toHaveTextContent('Rossi · 4 people');
    expect(rossi).toHaveTextContent('T1 · 4');
    expect(rossi).not.toHaveTextContent('on 1 table');
    const ferrari = screen.getByRole('button', { name: 'Group B, Ferrari' });
    expect(ferrari).toHaveTextContent('Ferrari · 8 people');
    expect(ferrari).toHaveTextContent('T4 · 6 + T5 · 2');
    expect(ferrari).toHaveTextContent('on 2 tables');
  });

  it('uses the singular for a party of one', () => {
    render(
      <FloorGroups
        groups={[group({ partySize: 1 })]}
        slot={slot}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Group A, Rossi' })).toHaveTextContent('1 person');
  });

  it('marks a pending group', () => {
    render(
      <FloorGroups
        groups={[
          group(),
          group({ label: 'B', bookingId: 2, fullName: 'Bianchi', status: 'PENDING' }),
        ]}
        slot={slot}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Group B, Bianchi' })).toHaveTextContent('pending');
    expect(screen.getByRole('button', { name: 'Group A, Rossi' })).not.toHaveTextContent('pending');
  });

  it('shows the time of the booked slot only when it is not the slot shown', () => {
    render(
      <FloorGroups
        groups={[
          group(),
          group({
            label: 'B',
            bookingId: 2,
            fullName: 'Bianchi',
            startTime: '12:00',
            endTime: '13:00',
          }),
        ]}
        slot={slot}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Group B, Bianchi' })).toHaveTextContent(
      'Slot 12:00–13:00',
    );
    expect(screen.getByRole('button', { name: 'Group A, Rossi' })).not.toHaveTextContent('Slot ');
  });

  it('marks the selected row as pressed and shows where its people sit', () => {
    render(<FloorGroups groups={[group(), split]} slot={slot} selected="B" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Group B, Ferrari' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Group A, Rossi' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Group assignment')).toBeInTheDocument();
    expect(screen.getByText('T4')).toBeInTheDocument();
    expect(screen.getByText('6 people')).toBeInTheDocument();
    expect(screen.getByText('T5')).toBeInTheDocument();
    expect(screen.getByText('2 people')).toBeInTheDocument();
    expect(screen.getByText(/one group seated on different tables/)).toBeInTheDocument();
  });

  it('does not explain the split for a group on one table', () => {
    render(<FloorGroups groups={[group()]} slot={slot} selected="A" onSelect={() => {}} />);
    expect(screen.getByText('Group assignment')).toBeInTheDocument();
    expect(screen.queryByText(/one group seated on different tables/)).not.toBeInTheDocument();
  });

  it('shows the assignment of the selected group only', () => {
    render(
      <FloorGroups groups={[group(), split]} slot={slot} selected={null} onSelect={() => {}} />,
    );
    expect(screen.queryByText('Group assignment')).not.toBeInTheDocument();
  });

  it('selects a group when its row is clicked, and clears it when clicked again', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <FloorGroups groups={[group()]} slot={slot} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Group A, Rossi' }));
    expect(onSelect).toHaveBeenLastCalledWith('A');

    rerender(<FloorGroups groups={[group()]} slot={slot} selected="A" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Group A, Rossi' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
