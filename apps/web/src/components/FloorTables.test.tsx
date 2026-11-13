import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MomentTable } from '../lib/floorMoments.ts';
import { FloorTables } from './FloorTables.tsx';

const table = (
  tableNumber: number,
  capacity: number,
  groups: { label: string; seats: number }[] = [],
  otherSeats = 0,
): MomentTable => {
  const own = groups.reduce((sum, g) => sum + g.seats, 0);
  return {
    tableNumber,
    capacity,
    groups,
    otherSeats,
    freeSeats: Math.max(capacity - own - otherSeats, 0),
  };
};

const tables = [
  table(5, 6, [{ label: 'B', seats: 2 }]),
  table(1, 4, [{ label: 'A', seats: 4 }]),
  table(4, 6, [{ label: 'B', seats: 6 }]),
];

const tableCard = (n: number) => screen.getByText(`Table ${n}`).closest('li') as HTMLElement;

interface Props {
  tables?: MomentTable[];
  otherSlots?: string[];
  selected?: string | null;
  showAll?: boolean;
  onSelect?: (label: string | null) => void;
}

const renderTables = ({
  tables: list = tables,
  otherSlots = [],
  selected = null,
  showAll = false,
  onSelect = () => {},
}: Props = {}) =>
  render(
    <FloorTables
      tables={list}
      otherSlots={otherSlots}
      selected={selected}
      showAll={showAll}
      onSelect={onSelect}
    />,
  );

describe('FloorTables', () => {
  it('orders the tables by number, whatever the order it receives', () => {
    renderTables();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Table 1',
      'Table 4',
      'Table 5',
    ]);
  });

  it('does not change the tables it receives', () => {
    renderTables();
    expect(tables.map((t) => t.tableNumber)).toEqual([5, 1, 4]);
  });

  it('says how many seats are taken at each table', () => {
    renderTables({ tables: [...tables, table(2, 4), table(3, 4, [], 3)] });
    expect(within(tableCard(1)).getByText('full')).toBeInTheDocument();
    expect(within(tableCard(5)).getByText('2 / 6 taken')).toBeInTheDocument();
    expect(within(tableCard(2)).getByText('0 / 4 taken')).toBeInTheDocument();
    expect(within(tableCard(3)).getByText('3 / 4 taken')).toBeInTheDocument();
  });

  it('draws the seats of a group without its letter while it is not selected', () => {
    const { container } = renderTables({ tables: [table(5, 6, [{ label: 'B', seats: 2 }])] });
    const seats = screen.getAllByRole('button', { name: 'Group B, table 5, 2 seats' });
    expect(seats).toHaveLength(2);
    for (const seat of seats) {
      expect(seat).toHaveClass('floor-seat--booked');
      expect(seat).toHaveTextContent('');
    }
    expect(container.querySelectorAll('.floor-seat--free')).toHaveLength(4);
  });

  it('colours the seats of the selected group only, with its letter', () => {
    renderTables({
      tables: [
        table(5, 6, [
          { label: 'B', seats: 2 },
          { label: 'C', seats: 3 },
        ]),
      ],
      selected: 'B',
    });
    for (const seat of screen.getAllByRole('button', { name: /^Group B/ })) {
      expect(seat).toHaveClass('floor-seat--taken');
      expect(seat).toHaveTextContent('B');
    }
    for (const seat of screen.getAllByRole('button', { name: /^Group C/ })) {
      expect(seat).toHaveClass('floor-seat--booked');
    }
  });

  it('colours every group when all are shown', () => {
    renderTables({ showAll: true });
    for (const seat of screen.getAllByRole('button', { name: /^Group / })) {
      expect(seat).toHaveClass('floor-seat--taken');
      expect(seat).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getAllByRole('button', { name: /^Group A/ })[0]).toHaveTextContent('A');
  });

  it('hatches the seats taken by an overlapping slot and says which slot holds them', () => {
    const { container } = renderTables({
      tables: [table(2, 4, [{ label: 'A', seats: 1 }], 2)],
      otherSlots: ['12:00–13:00'],
    });
    expect(container.querySelectorAll('.floor-seat--other')).toHaveLength(2);
    expect(container.querySelectorAll('.floor-seat--free')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(within(tableCard(2)).getByText('2 seats for the slot 12:00–13:00')).toBeInTheDocument();
  });

  it('writes the capacity of the table and its free seats', () => {
    renderTables();
    expect(within(tableCard(1)).getByText('4 seats in total')).toBeInTheDocument();
    expect(within(tableCard(5)).getByText('6 seats in total, 4 free')).toBeInTheDocument();
    expect(screen.queryByText(/ for the slot/)).not.toBeInTheDocument();
  });

  it('highlights the tables of the selected group only', () => {
    renderTables({ selected: 'B' });
    expect(tableCard(4)).toHaveClass('floor-table--selected');
    expect(tableCard(5)).toHaveClass('floor-table--selected');
    expect(tableCard(1)).not.toHaveClass('floor-table--selected');
    for (const seat of screen.getAllByRole('button', { name: /^Group B/ })) {
      expect(seat).toHaveAttribute('aria-pressed', 'true');
    }
    for (const seat of screen.getAllByRole('button', { name: /^Group A/ })) {
      expect(seat).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('highlights nothing when no group is selected', () => {
    const { container } = renderTables();
    expect(container.querySelectorAll('.floor-table--selected')).toHaveLength(0);
  });

  it('selects the group of a seat that is clicked', () => {
    const onSelect = vi.fn();
    renderTables({ onSelect });
    fireEvent.click(screen.getAllByRole('button', { name: 'Group A, table 1, 4 seats' })[0]!);
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('clears the selection when a seat of the selected group is clicked', () => {
    const onSelect = vi.fn();
    renderTables({ selected: 'A', onSelect });
    fireEvent.click(screen.getAllByRole('button', { name: 'Group A, table 1, 4 seats' })[0]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
