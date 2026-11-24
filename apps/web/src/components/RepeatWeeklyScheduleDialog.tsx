import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_REPEAT_WEEKS, repeatWeeklyScheduleSchema } from '@mountain-hut/shared';
import type { RepeatWeeklyScheduleResult } from '../api/slots.ts';
import { useRepeatWeeklySchedule, useSchedules } from '../api/useSlots.ts';
import { addDays, dateShort, fromIsoDate } from '../lib/dates.ts';
import { slotErrorMessage } from '../lib/slotTables.ts';
import { FormField } from './FormField.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';

interface RepeatWeeklyScheduleDialogProps {
  // First day of the source week: the day chosen on the page.
  sourceStartDate: string;
  onDone: (message: string) => void;
  onClose: () => void;
}

const weeksLabel = (n: number): string => (n === 1 ? '1 week' : `${n} weeks`);
const slotsLabel = (n: number): string => (n === 1 ? '1 slot' : `${n} slots`);
// Every day of the target weeks: day 7 to day 7·weeks + 6 after the source start.
const targetDays = (sourceStartDate: string, weeks: number): string[] =>
  Array.from({ length: 7 * weeks }, (_, i) => addDays(sourceStartDate, 7 + i));

// How many slots the copy will replace, once every target day is loaded.
function replacedHint(total: number | undefined, isPending: boolean): string | null {
  if (isPending) return 'Checking the slots already in the target weeks…';
  if (total === undefined) return null;
  if (total === 0) return 'The target weeks have no slots: nothing will be replaced.';
  return `${slotsLabel(total)} already in the target weeks will be replaced.`;
}

const range = (from: string, to: string): string =>
  `${dateShort(fromIsoDate(from))} – ${dateShort(fromIsoDate(to))}`;

// The toast the page shows once the copy is done.
function repeatDoneMessage(result: RepeatWeeklyScheduleResult): string {
  const replaced =
    result.replacedSlotsCount > 0 ? ` ${slotsLabel(result.replacedSlotsCount)} replaced.` : '';
  return (
    `Schedule successfully repeated across ${weeksLabel(result.targetWeeks)}: ` +
    `${slotsLabel(result.createdSlotsCount)} created.${replaced}`
  );
}

// Copies the slots of the 7 days from sourceStartDate into the next weeks.
export function RepeatWeeklyScheduleDialog({
  sourceStartDate,
  onDone,
  onClose,
}: RepeatWeeklyScheduleDialogProps) {
  const repeat = useRepeatWeeklySchedule();
  const [weeks, setWeeks] = useState('1');
  const [weeksError, setWeeksError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // The number of weeks is the only thing to choose: it gets the focus.
  useEffect(() => {
    document.getElementById('repeat-weeks')?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // The target weeks follow the number typed, while it is a valid one.
  const n = Number(weeks);
  const validWeeks = Number.isInteger(n) && n >= 1 && n <= MAX_REPEAT_WEEKS;
  const sourceEnd = addDays(sourceStartDate, 6);
  // While the number is not valid there is no target period, so nothing is loaded.
  const existing = useSchedules(validWeeks ? targetDays(sourceStartDate, n) : []);
  const toReplace = validWeeks ? (existing.total ?? 0) : 0;
  const submitLabel =
    toReplace > 0 ? `Replace ${slotsLabel(toReplace)} and repeat` : 'Repeat schedule';
  const replaced = validWeeks ? replacedHint(existing.total, existing.isPending) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWeeksError(undefined);
    setError(null);

    // An empty field is 0 weeks, so it gets the same message.
    const parsed = repeatWeeklyScheduleSchema.safeParse({
      sourceStartDate,
      repeatWeeks: weeks.trim() === '' ? 0 : Number(weeks),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] !== 'repeatWeeks') {
        setError('Choose a valid day on the page first.');
      } else if (issue.code === 'too_small') {
        setWeeksError('Must be at least 1 week.');
      } else if (issue.code === 'too_big') {
        setWeeksError(`At most ${weeksLabel(MAX_REPEAT_WEEKS)}.`);
      } else {
        setWeeksError('Enter a whole number of weeks.');
      }
      return;
    }

    repeat.mutate(parsed.data, {
      onSuccess: (result) => onDone(repeatDoneMessage(result)),
      onError: (e) => setError(slotErrorMessage(e)),
    });
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repeat-dialog-title"
        aria-describedby="repeat-dialog-text"
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <h2 id="repeat-dialog-title" className="dialog__title">
          Repeat weekly schedule
        </h2>
        <p id="repeat-dialog-text" className="dialog__text">
          Copies every slot of the week, with its tables, onto the same weekdays of the next weeks.{' '}
          <strong>
            The slots already in those weeks are replaced. A week with reservations cannot be
            replaced.
          </strong>
        </p>

        <form className="slot-form" onSubmit={onSubmit} noValidate>
          <div className="dialog__request">
            <span>Source week</span>
            <strong>{range(sourceStartDate, sourceEnd)}</strong>
          </div>

          <FormField
            id="repeat-weeks"
            label="Number of weeks to repeat"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_REPEAT_WEEKS}
            step={1}
            value={weeks}
            onChange={(e) => {
              setWeeks(e.target.value);
              setWeeksError(undefined);
              setError(null);
            }}
            error={weeksError}
          />

          {validWeeks && (
            <p className="field__hint">
              Target: {range(addDays(sourceStartDate, 7), addDays(sourceStartDate, 7 * n + 6))}
            </p>
          )}

          {replaced && (
            <p className="field__hint" aria-live="polite">
              <strong>{replaced}</strong>
            </p>
          )}

          {error && <ErrorNotice message={error} />}

          <button type="submit" className="cta cta--center" disabled={repeat.isPending}>
            {repeat.isPending ? 'Repeating…' : submitLabel}
          </button>
          <button type="button" className="pill slot-form__cancel" onClick={onClose}>
            Close
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
