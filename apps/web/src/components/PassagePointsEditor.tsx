import { useEffect, useRef } from 'react';
import { MAX_HIKE_PASSAGE_POINT_LENGTH, MAX_HIKE_PASSAGE_POINTS } from '@mountain-hut/shared';
import { useToast } from './Toast.tsx';

// One row of the editor: the key stays the same while the text and the order change.
export interface PassagePointDraft {
  key: number;
  value: string;
}

interface PassagePointsEditorProps {
  value: PassagePointDraft[];
  onChange: (rows: PassagePointDraft[]) => void;
  /** Error message per row, keyed by PassagePointDraft.key. */
  errors?: Partial<Record<number, string>>;
}

const nextKey = (rows: PassagePointDraft[]): number =>
  rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;

// MH-20: the optional intermediate points of a hike, in the order they are passed.
export function PassagePointsEditor({ value, onChange, errors = {} }: PassagePointsEditorProps) {
  const toast = useToast();
  // The latest rows and handler, read by an Undo pressed after later edits.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  // Undo toasts of this editor: they make no sense once the form is gone.
  const undoToasts = useRef<number[]>([]);
  useEffect(() => {
    const ids = undoToasts.current;
    return () => ids.forEach((id) => toast.dismiss(id));
  }, [toast]);
  // The row just added takes the focus once shown.
  const focusKey = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (focusKey.current === null) return;
    listRef.current?.querySelector<HTMLInputElement>(`#passage-point-${focusKey.current}`)?.focus();
    focusKey.current = null;
  });

  const full = value.length >= MAX_HIKE_PASSAGE_POINTS;

  // Same as the requirements of a booking: the row goes, a toast offers to put it back.
  function remove(row: PassagePointDraft, index: number) {
    onChange(value.filter((r) => r.key !== row.key));
    const id = toast.show({
      message: 'Passage point removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          const rows = latest.current.value.filter((r) => r.key !== row.key);
          const restored = [...rows];
          restored.splice(Math.min(index, rows.length), 0, row);
          latest.current.onChange(restored.slice(0, MAX_HIKE_PASSAGE_POINTS));
        },
      },
    });
    undoToasts.current.push(id);
  }

  function add() {
    const key = nextKey(value);
    focusKey.current = key;
    onChange([...value, { key, value: '' }]);
  }

  return (
    <fieldset className="passage-points">
      <legend className="field__label">Passage points</legend>
      <p className="field__hint" id="passage-points-hint">
        Optional. The places you pass on the way, in order (at most {MAX_HIKE_PASSAGE_POINTS}).
      </p>
      {value.length > 0 && (
        <ol className="passage-points__list" ref={listRef}>
          {value.map((row, index) => {
            const id = `passage-point-${row.key}`;
            const error = errors[row.key];
            return (
              <li key={row.key} className="passage-points__row">
                <span className="passage-points__index" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="passage-points__field">
                  <label htmlFor={id} className="visually-hidden">
                    Passage point {index + 1}
                  </label>
                  <input
                    id={id}
                    type="text"
                    className="passage-points__input"
                    placeholder="e.g. Rifugio Tito Zilioli"
                    maxLength={MAX_HIKE_PASSAGE_POINT_LENGTH}
                    value={row.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(e) =>
                      onChange(
                        value.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)),
                      )
                    }
                  />
                  {error && (
                    <p id={`${id}-error`} role="alert" className="field-error">
                      {error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="pill pill--remove"
                  aria-label={`Remove passage point ${index + 1}`}
                  onClick={() => remove(row, index)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="pill pill--outline"
        onClick={add}
        disabled={full}
        aria-describedby="passage-points-hint"
      >
        {value.length === 0 ? 'Add a passage point' : 'Add another passage point'}
      </button>
    </fieldset>
  );
}
