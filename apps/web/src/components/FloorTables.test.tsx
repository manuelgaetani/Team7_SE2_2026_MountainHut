import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FloorTable } from '@mountain-hut/shared';
import { FloorTables } from './FloorTables.tsx';

const table = (
  tableNumber: number,
  capacity: number,
  groups: { label: string; seats: number }[] = [],
): FloorTable => {
  const occupiedSeats = groups.reduce((sum, g) => sum + g.seats, 0);
  return {
    tableNumber,
    capacity,
    occupiedSeats,
    freeSeats: Math.max(capacity - occupiedSeats, 0),
    groups,
  };
};

const tables = [
  table(5, 6, [{ label: 'B', seats: 2 }]),
  table(1, 4, [{ label: 'A', seats: 4 }]),
  table(4, 6, [{ label: 'B', seats: 6 }]),
];

const tableCard = (n: number) => screen.getByText(`Table ${n}`).closest('li') as HTMLElement;

describe('FloorTables', () => {
  it('orders the tables by number, whatever the order it receives', () => {
    render(<FloorTables tables={tables} selected={null} onSelect={() => {}} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Table 1',
      'Table 4',
      'Table 5',
    ]);
  });

  it('does not change the tables it receives', () => {
    render(<FloorTables tables={tables} selected={null} onSelect={() => {}} />);
    expect(tables.map((t) => t.tableNumber)).toEqual([5, 1, 4]);
  });

  it('says how many seats are taken at each table', () => {
    render(<FloorTables tables={[...tables, table(2, 4)]} selected={null} onSelect={() => {}} />);
    expect(within(tableCard(1)).getByText('full')).toBeInTheDocument();
    expect(within(tableCard(5)).getByText('2 / 6 taken')).toBeInTheDocument();
    expect(within(tableCard(2)).getByText('0 / 4 taken')).toBeInTheDocument();
  });

  it('draws a button with the letter for each taken seat and an empty square for each free one', () => {
    const { container } = render(
      <FloorTables
        tables={[table(5, 6, [{ label: 'B', seats: 2 }])]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    const seats = screen.getAllByRole('button', { name: 'Group B, table 5, 2 seats' });
    expect(seats).toHaveLength(2);
    for (const seat of seats) expect(seat).toHaveTextContent('B');
    expect(container.querySelectorAll('.floor-seat--free')).toHaveLength(4);
  });

  it('shows the seats of two groups at the same table', () => {
    render(
      <FloorTables
        tables={[
          table(5, 6, [
            { label: 'B', seats: 2 },
            { label: 'C', seats: 3 },
          ]),
        ]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Group B, table 5, 2 seats' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Group C, table 5, 3 seats' })).toHaveLength(3);
  });

  it('writes the capacity of the table and its free seats', () => {
    render(<FloorTables tables={tables} selected={null} onSelect={() => {}} />);
    expect(within(tableCard(1)).getByText('4 seats in total')).toBeInTheDocument();
    expect(within(tableCard(5)).getByText('6 seats in total, 4 free')).toBeInTheDocument();
  });

  it('never draws more free squares than there are free seats, even when over capacity', () => {
    const { container } = render(
      <FloorTables
        tables={[
          table(1, 4, [
            { label: 'A', seats: 3 },
            { label: 'B', seats: 3 },
          ]),
        ]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelectorAll('.floor-seat--free')).toHaveLength(0);
    expect(within(tableCard(1)).getByText('full')).toBeInTheDocument();
  });

  it('highlights the tables of the selected group only', () => {
    render(<FloorTables tables={tables} selected="B" onSelect={() => {}} />);
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
    const { container } = render(
      <FloorTables tables={tables} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('.floor-table--selected')).toHaveLength(0);
  });

  it('selects the group of a seat that is clicked', () => {
    const onSelect = vi.fn();
    render(<FloorTables tables={tables} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Group A, table 1, 4 seats' })[0]!);
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('clears the selection when a seat of the selected group is clicked', () => {
    const onSelect = vi.fn();
    render(<FloorTables tables={tables} selected="A" onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Group A, table 1, 4 seats' })[0]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
