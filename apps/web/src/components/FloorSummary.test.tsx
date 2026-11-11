import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FloorSummary } from './FloorSummary.tsx';

describe('FloorSummary', () => {
  it('shows the four numbers of the slot', () => {
    render(
      <FloorSummary
        totals={{
          capacity: 32,
          occupiedSeats: 23,
          freeSeats: 9,
          confirmedGroups: 5,
          splitGroups: 2,
        }}
      />,
    );

    const cards = within(screen.getByRole('list', { name: 'Summary of the slot' })).getAllByRole(
      'listitem',
    );
    expect(cards.map((c) => c.textContent)).toEqual([
      '23 / 32seats taken',
      '9free seats',
      '5confirmed groups',
      '2groups on more than one table',
    ]);
  });
});
