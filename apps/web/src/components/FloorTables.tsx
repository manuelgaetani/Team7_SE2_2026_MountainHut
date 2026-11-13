import type { FloorTable } from '@mountain-hut/shared';
import { seatAriaLabel, tableTakenLabel } from '../lib/floorLabels.ts';
import { groupColor } from '../lib/floorPalette.ts';

interface FloorTablesProps {
  tables: FloorTable[];
  selected: string | null;
  // Called with the label of the group, or null to clear the selection.
  onSelect: (label: string | null) => void;
}

// The tables of the slot in an automatic grid, ordered by number. One square for each seat:
// white if free, the colour and letter of the group if taken.
export function FloorTables({ tables, selected, onSelect }: FloorTablesProps) {
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
                  const { background, color } = groupColor(group.label);
                  const isSelected = selected === group.label;
                  return (
                    <button
                      key={`${group.label}-${i}`}
                      type="button"
                      className={`floor-seat floor-seat--taken${
                        isSelected ? ' floor-seat--selected' : ''
                      }`}
                      style={{ backgroundColor: background, color }}
                      aria-label={seatAriaLabel(group.label, table.tableNumber, group.seats)}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(isSelected ? null : group.label)}
                    >
                      {group.label}
                    </button>
                  );
                }),
              )}
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
          </li>
        );
      })}
    </ul>
  );
}
