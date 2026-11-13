import type { BookingResult, PartyRequirement } from '@mountain-hut/shared';

interface BookingSummaryProps {
  dateLabel: string;
  time: string | null;
  guests: number;
  tables: BookingResult['tables'] | null;
  requirements?: PartyRequirement[];
}

const POLICY = 'You can book up to 2 hours before the shift starts';

const countLabel = (total: number, withAllergies: number): string =>
  `${total} ${total === 1 ? 'requirement' : 'requirements'} · ${withAllergies} with allergies`;

export function BookingSummary({
  dateLabel,
  time,
  guests,
  tables,
  requirements = [],
}: BookingSummaryProps) {
  const withAllergies = requirements.filter((r) => r.allergies).length;

  return (
    <aside className="summary" aria-label="Booking Summary">
      <h3 className="summary__title">Quick Booking</h3>
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
        {requirements.length > 0 && (
          <div>
            <dt>Dietary requirements</dt>
            <dd className="summary__seating">{countLabel(requirements.length, withAllergies)}</dd>
            <dd>
              <ul className="summary__requirements">
                {requirements.map((r, i) => (
                  <li key={i}>
                    {r.allergies ? 'Allergies · ' : ''}
                    {r.description}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt>Policy</dt>
          <dd className="summary__policy">{POLICY}</dd>
        </div>
      </dl>
    </aside>
  );
}
