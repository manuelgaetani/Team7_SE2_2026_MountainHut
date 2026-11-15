import type { FloorGroup } from '@mountain-hut/shared';
import { groupTablesLabel, onTablesLabel, peopleLabel } from '../lib/floorLabels.ts';
import { GroupBadge } from './GroupBadge.tsx';

interface FloorGroupsProps {
  // Only the groups that booked the slot shown.
  groups: FloorGroup[];
  selected: string | null;
  onSelect: (label: string | null) => void;
}

// The side list of the groups that booked the slot. A row can be selected: the selected one
// shows where its people sit.
export function FloorGroups({ groups, selected, onSelect }: FloorGroupsProps) {
  if (groups.length === 0) {
    return <p className="field__hint">Nobody has booked this slot yet.</p>;
  }

  return (
    <ul className="floor-groups" aria-label="Groups of the slot">
      {groups.map((group) => {
        const isSelected = selected === group.label;
        const split = group.tables.length > 1;
        return (
          <li
            key={group.bookingId}
            className={`floor-group${isSelected ? ' floor-group--selected' : ''}`}
          >
            <button
              type="button"
              className="floor-group__row"
              aria-pressed={isSelected}
              aria-label={`Group ${group.label}, ${group.fullName}`}
              onClick={() => onSelect(isSelected ? null : group.label)}
            >
              <GroupBadge label={group.label} />
              <span className="floor-group__info">
                <span className="floor-group__name">
                  {group.fullName} · {peopleLabel(group.partySize)}
                </span>
                <span className="floor-group__tables">{groupTablesLabel(group)}</span>
              </span>
              <span className="floor-group__tags">
                {group.status === 'PENDING' && (
                  <span className="floor-group__tag floor-group__tag--pending">pending</span>
                )}
                {split && (
                  <span className="floor-group__tag">{onTablesLabel(group.tables.length)}</span>
                )}
              </span>
            </button>
            {isSelected && (
              <div className="floor-group__detail">
                <h4 className="floor-group__detail-title">Group assignment</h4>
                <dl className="floor-group__assignment">
                  {group.tables.map((t) => (
                    <div key={t.tableNumber} className="floor-group__assigned">
                      <dt>T{t.tableNumber}</dt>
                      <dd>{peopleLabel(t.seats)}</dd>
                    </div>
                  ))}
                </dl>
                {split && (
                  <p className="field__hint">
                    Same letter, same colour: one group seated on different tables.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
