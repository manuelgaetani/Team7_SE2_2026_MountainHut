import type { FloorTotals } from '@mountain-hut/shared';

// The four numbers at the top of the floor plan.
export function FloorSummary({ totals }: { totals: FloorTotals }) {
  const cards = [
    { id: 'taken', value: `${totals.occupiedSeats} / ${totals.capacity}`, label: 'seats taken' },
    { id: 'free', value: String(totals.freeSeats), label: 'free seats' },
    { id: 'confirmed', value: String(totals.confirmedGroups), label: 'confirmed groups' },
    { id: 'split', value: String(totals.splitGroups), label: 'groups on more than one table' },
  ];

  return (
    <ul className="floor-summary" aria-label="Summary of the slot">
      {cards.map((card) => (
        <li key={card.id} className="summary floor-summary__card">
          <span className="floor-summary__value">{card.value}</span>
          <span className="floor-summary__label">{card.label}</span>
        </li>
      ))}
    </ul>
  );
}
