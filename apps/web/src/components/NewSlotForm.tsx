import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCreateSlot } from '../api/useSlots.ts';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import {
  emptyTablesChoice,
  seatsLabel,
  slotErrorMessage,
  toTablesSource,
} from '../lib/slotTables.ts';
import type { TablesChoice } from '../lib/slotTables.ts';
import { normalizeTime } from '../lib/time.ts';
import { TimeField } from './TimeField.tsx';
import { TablesChooser } from './TablesChooser.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';
import { useToast } from './Toast.tsx';

interface NewSlotFormProps {
  date: string;
}

export function NewSlotForm({ date }: NewSlotFormProps) {
  const create = useCreateSlot();
  const toast = useToast();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [tables, setTables] = useState<TablesChoice>(emptyTablesChoice);
  const [error, setError] = useState<string | null>(null);

  // A message about the previous attempt is out of date as soon as the form changes.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setError(null);
    };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!startTime.trim() || !endTime.trim()) {
      setError('Enter the start and the end time.');
      return;
    }
    // Typed times ("930", "19.30") become HH:MM, as on the availability page.
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    const isTime = (t: string) => /^\d{2}:\d{2}$/.test(t);
    if (!isTime(start) || !isTime(end)) {
      setError('Enter the times as HH:MM, for example 12:00.');
      return;
    }
    // HH:MM strings compare like times.
    if (end <= start) {
      setError('The end time must be after the start time.');
      return;
    }
    const result = toTablesSource(tables);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    create.mutate(
      { date, startTime: start, endTime: end, ...result.source },
      {
        onSuccess: (slot) => {
          toast.show({
            message: `Slot created: ${slot.startTime}–${slot.endTime}, ${seatsLabel(slot.totalSeats)}.`,
          });
          setStartTime('');
          setEndTime('');
          setTables(emptyTablesChoice());
        },
        onError: (e) => setError(slotErrorMessage(e)),
      },
    );
  }

  return (
    <form className="summary slot-form" onSubmit={onSubmit} noValidate aria-labelledby="new-slot">
      <h3 id="new-slot" className="summary__title">
        New slot on {dateShort(fromIsoDate(date))}
      </h3>
      <div className="slot-form__times">
        <TimeField
          id="new-slot-start"
          label="Start"
          value={startTime}
          onChange={edit(setStartTime)}
        />
        <TimeField id="new-slot-end" label="End" value={endTime} onChange={edit(setEndTime)} />
      </div>
      <TablesChooser
        idPrefix="new-slot"
        modes={['list', 'copy', 'later']}
        value={tables}
        onChange={edit(setTables)}
        copyDate={date}
      />
      {error && <ErrorNotice message={error} />}
      <button type="submit" className="cta" disabled={create.isPending}>
        {create.isPending ? 'Saving…' : 'Create the slot'}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
