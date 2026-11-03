import { useState } from 'react';
import { Link } from 'react-router';
import type { SlotDetails } from '../api/slots.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useSchedule } from '../api/useSlots.ts';
import { DefineTablesForm } from '../components/DefineTablesForm.tsx';
import { FormField } from '../components/FormField.tsx';
import { NewSlotForm } from '../components/NewSlotForm.tsx';
import { SlotSchedule } from '../components/SlotSchedule.tsx';
import { toIsoDate } from '../lib/dates.ts';
import { slotErrorMessage } from '../lib/slotTables.ts';
import './BookingPage.css';
import './SlotsPage.css';

function SlotsManager() {
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [defining, setDefining] = useState<SlotDetails | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const schedule = useSchedule(date);

  return (
    <div className="layout layout--staff">
      <div className="layout__form">
        <FormField
          id="schedule-date"
          label="Day"
          type="date"
          value={date}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setDefining(null);
            setSaved(null);
          }}
        />
        {saved && (
          <p role="status" className="notice notice--ok">
            {saved}
          </p>
        )}
        {schedule.isPending && <p role="status">Loading the slots of the day…</p>}
        {schedule.isError && (
          <p role="alert" className="notice notice--error">
            {slotErrorMessage(schedule.error)}
          </p>
        )}
        {schedule.isSuccess && (
          <SlotSchedule
            slots={schedule.data}
            onDefineTables={(slot) => {
              setDefining(slot);
              setSaved(null);
            }}
          />
        )}
      </div>

      <div className="layout__side">
        {defining ? (
          <DefineTablesForm
            key={defining.id}
            slot={defining}
            onDone={(message) => {
              setDefining(null);
              setSaved(message);
            }}
            onCancel={() => setDefining(null)}
          />
        ) : (
          <NewSlotForm key={date} date={date} />
        )}
      </div>
    </div>
  );
}

// MH-02: the staff define the time slots and the tables and seats of each one.
export function SlotsPage() {
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> with a staff account to manage the time slots.
        </p>
      );
    } else if (!isStaff) {
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
