import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SlotDetails } from '../api/slots.ts';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useSchedule } from '../api/useSlots.ts';
import { DefineTablesForm } from '../components/DefineTablesForm.tsx';
import { DateField } from '../components/DateField.tsx';
import { NewSlotForm } from '../components/NewSlotForm.tsx';
import { RepeatWeeklyScheduleDialog } from '../components/RepeatWeeklyScheduleDialog.tsx';
import { SlotSchedule } from '../components/SlotSchedule.tsx';
import { isIsoDate, toIsoDate } from '../lib/dates.ts';
import { slotErrorMessage } from '../lib/slotTables.ts';
import './BookingPage.css';
import './SlotsPage.css';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { useToast } from '../components/Toast.tsx';

function SlotsManager() {
  // The day comes from ?date= when the staff return from a floor plan; otherwise it is today.
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => {
    const fromUrl = searchParams.get('date');
    return isIsoDate(fromUrl) ? fromUrl : toIsoDate(new Date());
  });
  const [defining, setDefining] = useState<SlotDetails | null>(null);
  const [repeating, setRepeating] = useState(false);
  const schedule = useSchedule(date);
  const toast = useToast();

  return (
    <div className="layout layout--staff">
      <div className="layout__form">
        <DateField
          id="schedule-date"
          label="Day"
          value={date}
          onChange={(iso) => {
            setDate(iso);
            setDefining(null);
          }}
        />
        <div className="schedule-toolbar">
          <button type="button" className="pill" onClick={() => setRepeating(true)}>
            Repeat weekly schedule
          </button>
        </div>
        {schedule.isPending && <p role="status">Loading the slots of the day…</p>}
        {schedule.isError && <ErrorNotice message={slotErrorMessage(schedule.error)} />}
        {schedule.isSuccess && <SlotSchedule slots={schedule.data} onDefineTables={setDefining} />}
      </div>

      <div className="layout__side">
        {defining ? (
          <DefineTablesForm
            key={defining.id}
            slot={defining}
            onDone={(message) => {
              setDefining(null);
              toast.show({ message });
            }}
            onCancel={() => setDefining(null)}
          />
        ) : (
          <NewSlotForm key={date} date={date} />
        )}
      </div>
      {repeating && (
        <RepeatWeeklyScheduleDialog
          sourceStartDate={date}
          onDone={(message) => {
            setRepeating(false);
            toast.show({ message });
          }}
          onClose={() => setRepeating(false)}
        />
      )}
    </div>
  );
}

// MH-02: the staff define the time slots and the tables and seats of each one.
export function SlotsPage() {
  const { data: user, isPending } = useCurrentUser();

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Sign in</Link> with a staff account to manage the time slots.
        </p>
      );
    } else if (!isStaff(user)) {
      content = <p className="notice notice--ok">This page is for the hut staff.</p>;
    } else {
      content = <SlotsManager />;
    }
  }

  return (
    <div className="page">
      <div className="page__body">
        <h2 className="page__title">Time slots and tables</h2>
        <p className="page__subtitle">
          Set the tables and seats of each time slot, so the hut never takes more guests than it can
          serve.
        </p>
        {content}
      </div>
    </div>
  );
}
