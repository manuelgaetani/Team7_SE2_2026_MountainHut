import { useEffect, useRef } from 'react';
import { MAX_REQUIREMENTS_COUNT } from '@mountain-hut/shared';
import { useToast } from './Toast.tsx';

// A requirement as edited in the form. The key only identifies the row in the list.
export interface RequirementDraft {
  key: number;
  allergies: boolean;
  description: string;
}

interface RequirementsEditorProps {
  value: RequirementDraft[];
  onChange: (rows: RequirementDraft[]) => void;
  /** Error message per row, keyed by RequirementDraft.key. */
  errors?: Partial<Record<number, string>>;
}

const nextKey = (rows: RequirementDraft[]): number =>
  rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;

export function RequirementsEditor({ value, onChange, errors }: RequirementsEditorProps) {
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

  function remove(row: RequirementDraft, index: number) {
    onChange(value.filter((r) => r.key !== row.key));
    const id = toast.show({
      message: row.allergies ? 'Allergy requirement removed.' : 'Requirement removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          const rows = latest.current.value.filter((r) => r.key !== row.key);
          const restored = [...rows];
          restored.splice(Math.min(index, rows.length), 0, row);
          latest.current.onChange(restored.slice(0, MAX_REQUIREMENTS_COUNT));
        },
      },
    });
    undoToasts.current.push(id);
  }

  const update = (key: number, patch: Partial<RequirementDraft>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addButton = (
    <button
      type="button"
      className="pill"
      disabled={value.length >= MAX_REQUIREMENTS_COUNT}
      onClick={() =>
        onChange([...value, { key: nextKey(value), allergies: false, description: '' }])
      }
    >
      {value.length === 0 ? 'Add a requirement' : 'Add another requirement'}
    </button>
  );

  return (
    <div className="field requirements">
      {/* With no entries the add button sits beside the title; then it moves below the rows. */}
      <div className="requirements__head">
        <div>
          <h3 className="field__label">Dietary requirements</h3>
          <p className="field__hint">Add one entry for each person or group with the same needs.</p>
        </div>
        {value.length === 0 && addButton}
      </div>

      {value.map((row, index) => {
        const id = `requirement-${row.key}`;
        const error = errors?.[row.key];
        return (
          // The legend names the group: the controls inside keep short names
          // ("Details", "Allergies", "Remove") so each one is found without ambiguity.
          <fieldset key={row.key} className="requirement" data-testid="requirement-row">
            <legend className="field__label requirement__legend">Requirement {index + 1}</legend>
            <label htmlFor={id}>Details</label>
            <div className="requirement__row">
              <input
                id={id}
                type="text"
                className="requirement__input"
                value={row.description}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                placeholder="e.g. 2 vegetarians"
                onChange={(e) => update(row.key, { description: e.target.value })}
              />
              <label className="requirement__allergy">
                <input
                  type="checkbox"
                  checked={row.allergies}
                  onChange={(e) => update(row.key, { allergies: e.target.checked })}
                />
                Allergies
              </label>
              <button
                type="button"
                className="requirement__remove"
                onClick={() => remove(row, index)}
              >
                Remove
              </button>
            </div>
            {error && (
              <p id={`${id}-error`} role="alert" className="field-error">
                {error}
              </p>
            )}
          </fieldset>
        );
      })}

      {value.length > 0 && addButton}
    </div>
  );
}
