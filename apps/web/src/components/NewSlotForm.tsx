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
import { FormField } from './FormField.tsx';
import { TablesChooser } from './TablesChooser.tsx';

interface NewSlotFormProps {
  date: string;
}

export function NewSlotForm({ date }: NewSlotFormProps) {
  const create = useCreateSlot();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [tables, setTables] = useState<TablesChoice>(emptyTablesChoice);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // A message about the previous attempt is out of date as soon as the form changes.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setError(null);
      setCreated(null);
    };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);

    if (!startTime || !endTime) {
      setError('Enter the start and the end time.');
      return;
    }
    // HH:MM strings compare like times.
    if (endTime <= startTime) {
      setError('The end time must be after the start time.');
      return;
    }
    const result = toTablesSource(tables);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    create.mutate(
      { date, startTime, endTime, ...result.source },
      {
        onSuccess: (slot) => {
          setCreated(`${slot.startTime}–${slot.endTime}, ${seatsLabel(slot.totalSeats)}`);
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
        <FormField
          id="new-slot-start"
          label="Start"
          type="time"
          value={startTime}
          onChange={(e) => edit(setStartTime)(e.target.value)}
        />
        <FormField
          id="new-slot-end"
          label="End"
          type="time"
          value={endTime}
          onChange={(e) => edit(setEndTime)(e.target.value)}
        />
      </div>
      <TablesChooser
        idPrefix="new-slot"
        modes={['list', 'copy', 'later']}
        value={tables}
        onChange={edit(setTables)}
        copyDate={date}
      />
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      {created && (
        <p role="status" className="notice notice--ok">
          Slot created: {created}.
        </p>
      )}
      <button type="submit" className="cta" disabled={create.isPending}>
        {create.isPending ? 'Saving…' : 'Create the slot'}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
