import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SlotDetails } from '../api/slots.ts';
import { useDefineSlotTables } from '../api/useSlots.ts';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import {
  emptyTablesChoice,
  seatsLabel,
  slotErrorMessage,
  toTablesSource,
} from '../lib/slotTables.ts';
import type { TablesChoice } from '../lib/slotTables.ts';
import { TablesChooser } from './TablesChooser.tsx';

interface DefineTablesFormProps {
  slot: SlotDetails;
  // Called with a short confirmation once the tables are saved.
  onDone: (message: string) => void;
  onCancel: () => void;
}

// For a slot without tables. Changing tables that are already defined is MH-19.
export function DefineTablesForm({ slot, onDone, onCancel }: DefineTablesFormProps) {
  const define = useDefineSlotTables();
  const [tables, setTables] = useState<TablesChoice>(emptyTablesChoice);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = toTablesSource(tables);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    define.mutate(
      { id: slot.id, source: result.source },
      {
        onSuccess: (saved) =>
          onDone(
            `Tables saved for ${saved.startTime}–${saved.endTime}, ${seatsLabel(saved.totalSeats)}.`,
          ),
        onError: (e) => setError(slotErrorMessage(e)),
      },
    );
  }

  return (
    <form
      className="summary slot-form"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="define-tables"
    >
      <h3 id="define-tables" className="summary__title">
        Tables for {slot.startTime}–{slot.endTime}, {dateShort(fromIsoDate(slot.date))}
      </h3>
      <TablesChooser
        idPrefix="define-tables"
        modes={['list', 'copy']}
        value={tables}
        onChange={(value) => {
          setTables(value);
          setError(null);
        }}
        copyDate={slot.date}
        excludeSlotId={slot.id}
      />
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      <button type="submit" className="cta" disabled={define.isPending}>
        {define.isPending ? 'Saving…' : 'Save the tables'}
        <span aria-hidden="true">→</span>
      </button>
      <button type="button" className="pill slot-form__cancel" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
