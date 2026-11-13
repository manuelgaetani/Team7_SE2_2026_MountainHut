import { otherSlotsLabel, seatAriaLabel, tableTakenLabel } from '../lib/floorLabels.ts';
import type { MomentTable } from '../lib/floorMoments.ts';
import { groupColor } from '../lib/floorPalette.ts';
import { seatsLabel } from '../lib/slotTables.ts';

interface FloorTablesProps {
  tables: MomentTable[];
  // The overlapping slots that hold seats in the moment shown.
  otherSlots: string[];
  selected: string | null;
  // When true every group of the slot shows its colour, not only the selected one.
  showAll: boolean;
  // Called with the label of the group, or null to clear the selection.
  onSelect: (label: string | null) => void;
}

// The tables of one moment of the slot, in an automatic grid ordered by number. One square
// for each seat: a seat of the slot shows the colour and letter of its group once the group
// is selected, a seat held by an overlapping slot is hatched, a free seat is empty.
export function FloorTables({ tables, otherSlots, selected, showAll, onSelect }: FloorTablesProps) {
  const ordered = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);

  return (
    <ul className="floor-tables" aria-label="Tables of the slot">
      {ordered.map((table) => {
        const highlighted = selected !== null && table.groups.some((g) => g.label === selected);
        return (
          <li
            key={table.tableNumber}
            className={`floor-table${highlighted ? ' floor-table--selected' : ''}`}
          >
            <div className="floor-table__head">
              <h3 className="floor-table__name">Table {table.tableNumber}</h3>
              <span className="floor-table__taken">{tableTakenLabel(table)}</span>
            </div>
            <div className="floor-table__seats">
              {table.groups.flatMap((group) =>
                Array.from({ length: group.seats }, (_, i) => {
                  const isSelected = selected === group.label;
                  const coloured = showAll || isSelected;
                  const { background, color } = groupColor(group.label);
                  return (
                    <button
                      key={`${group.label}-${i}`}
                      type="button"
                      className={`floor-seat ${
                        coloured ? 'floor-seat--taken' : 'floor-seat--booked'
                      }${isSelected ? ' floor-seat--selected' : ''}`}
                      style={coloured ? { backgroundColor: background, color } : undefined}
                      aria-label={seatAriaLabel(group.label, table.tableNumber, group.seats)}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(isSelected ? null : group.label)}
                    >
                      {coloured ? group.label : ''}
                    </button>
                  );
                }),
              )}
              {Array.from({ length: table.otherSeats }, (_, i) => (
                <span
                  key={`other-${i}`}
                  className="floor-seat floor-seat--other"
                  aria-hidden="true"
                />
              ))}
              {Array.from({ length: table.freeSeats }, (_, i) => (
                <span
                  key={`free-${i}`}
                  className="floor-seat floor-seat--free"
                  aria-hidden="true"
                />
              ))}
            </div>
            <p className="floor-table__capacity">
              {table.capacity} seats in total
              {table.freeSeats > 0 && `, ${table.freeSeats} free`}
            </p>
            {table.otherSeats > 0 && (
              <p className="floor-table__capacity">
                {seatsLabel(table.otherSeats)} for {otherSlotsLabel(otherSlots)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
