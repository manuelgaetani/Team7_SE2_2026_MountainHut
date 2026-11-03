import { useState } from 'react';
import { useSchedule } from '../api/useSlots.ts';
import { nextTableNumber, seatsLabel, tablesLabel } from '../lib/slotTables.ts';
import type { TableDraft, TablesChoice, TablesMode } from '../lib/slotTables.ts';
import { FormField } from './FormField.tsx';

const MODE_LABELS: Record<TablesMode, string> = {
  list: 'Enter the tables',
  copy: 'Copy from another slot',
  later: 'Add them later',
};

interface TablesChooserProps {
  idPrefix: string;
  modes: TablesMode[];
  value: TablesChoice;
  onChange: (value: TablesChoice) => void;
  // The day first shown when copying: usually the day being planned.
  copyDate: string;
  // The slot being edited, which cannot be its own source.
  excludeSlotId?: number;
}

export function TablesChooser({
  idPrefix,
  modes,
  value,
  onChange,
  copyDate: initialCopyDate,
  excludeSlotId,
}: TablesChooserProps) {
  const labelId = `${idPrefix}-tables-label`;

  return (
    <section className="field" aria-labelledby={labelId}>
      <div className="field__head">
        <h3 id={labelId} className="field__label">
          Tables
        </h3>
      </div>
      <div className="modes" role="radiogroup" aria-labelledby={labelId}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value.mode === mode}
            className="choice mode"
            onClick={() => onChange({ ...value, mode })}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {value.mode === 'list' && (
        <TableRows rows={value.rows} onChange={(rows) => onChange({ ...value, rows })} />
      )}
      {value.mode === 'copy' && (
        <CopySource
          idPrefix={idPrefix}
          initialDate={initialCopyDate}
          excludeSlotId={excludeSlotId}
          value={value.copyFromSlotId}
          onChange={(copyFromSlotId) => onChange({ ...value, copyFromSlotId })}
        />
      )}
      {value.mode === 'later' && (
        <p className="field__hint">
          The slot has 0 seats, and hikers cannot book it, until its tables are defined.
        </p>
      )}
    </section>
  );
}

function TableRows({
  rows,
  onChange,
}: {
  rows: TableDraft[];
  onChange: (rows: TableDraft[]) => void;
}) {
  const update = (index: number, change: Partial<TableDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const total = rows.reduce((sum, r) => sum + (Number(r.seats) || 0), 0);

  return (
    <div className="tables-editor">
      <div className="tables-editor__head" aria-hidden="true">
        <span>Table no.</span>
        <span>Seats</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="tables-editor__row">
          <input
            type="number"
            min={1}
            inputMode="numeric"
            aria-label={`Table number, row ${i + 1}`}
            value={row.tableNumber}
            onChange={(e) => update(i, { tableNumber: e.target.value })}
          />
          <input
            type="number"
            min={1}
            inputMode="numeric"
            aria-label={`Seats, row ${i + 1}`}
            value={row.seats}
            onChange={(e) => update(i, { seats: e.target.value })}
          />
          <button
            type="button"
            className="pill"
            aria-label={`Remove row ${i + 1}`}
            disabled={rows.length === 1}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="tables-editor__foot">
        <button
          type="button"
          className="pill"
          onClick={() => onChange([...rows, { tableNumber: nextTableNumber(rows), seats: '' }])}
        >
          Add a table
        </button>
        <span className="field__meta">
          {tablesLabel(rows.length)} · {seatsLabel(total)}
        </span>
      </div>
    </div>
  );
}

function CopySource({
  idPrefix,
  initialDate,
  excludeSlotId,
  value,
  onChange,
}: {
  idPrefix: string;
  initialDate: string;
  excludeSlotId: number | undefined;
  value: number | null;
  onChange: (slotId: number | null) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const schedule = useSchedule(date);
  const sources = (schedule.data ?? []).filter(
    (s) => s.tables.length > 0 && s.id !== excludeSlotId,
  );

  return (
    <div className="copy-source">
      <FormField
        id={`${idPrefix}-copy-date`}
        label="Copy from the day"
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          onChange(null);
        }}
      />
      {schedule.isPending && <p role="status">Loading the slots of the day…</p>}
      {schedule.isSuccess && sources.length === 0 && (
        <p className="notice notice--ok">No slot with tables on this day.</p>
      )}
      {sources.length > 0 && (
        <div className="field">
          <label htmlFor={`${idPrefix}-copy-slot`}>Slot to copy</label>
          <select
            id={`${idPrefix}-copy-slot`}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose a slot</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.startTime}–{s.endTime} · {tablesLabel(s.tables.length)} ·{' '}
                {seatsLabel(s.totalSeats)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
