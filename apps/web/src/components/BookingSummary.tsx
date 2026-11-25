import type { BookingResult } from '@mountain-hut/shared';
import { RequirementLine } from './RequirementLine.tsx';
import { toRequirement, type RequirementDraft } from '../lib/requirements.ts';

interface BookingSummaryProps {
  dateLabel: string;
  time: string | null;
  guests: number;
  tables: BookingResult['tables'] | null;
  requirements?: RequirementDraft[];
}

const POLICY = 'You can book up to 2 hours before the slot starts';

export function BookingSummary({
  dateLabel,
  time,
  guests,
  tables,
  requirements = [],
}: BookingSummaryProps) {
  return (
    <aside className="summary" aria-label="Booking Summary">
      <h3 className="summary__title">Your booking</h3>
      <dl className="summary__list">
        <div>
          <dt>Date</dt>
          <dd>{dateLabel}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{time ?? '—'}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>{guests === 1 ? '1 person' : `${guests} people`}</dd>
        </div>
      </dl>
      <hr className="summary__rule" />
      <dl className="summary__list summary__list--tight">
        <div>
          <dt>Seating</dt>
          <dd className="summary__seating">
            {tables
              ? tables
                  .map(
                    (t) =>
                      `Table ${t.tableNumber} (${t.assignedSeats} ${t.assignedSeats === 1 ? 'seat' : 'seats'})`,
                  )
                  .join(', ')
              : 'The table will be assigned upon confirmation'}
          </dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd className="summary__policy">{POLICY}</dd>
        </div>
      </dl>
      {requirements.length > 0 && (
        <div className="summary__requirements">
          <h4 className="summary__requirements-title">Requirements:</h4>
          <ul>
            {requirements.map((r) => (
              <li key={r.key}>
                <RequirementLine requirement={toRequirement(r)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
