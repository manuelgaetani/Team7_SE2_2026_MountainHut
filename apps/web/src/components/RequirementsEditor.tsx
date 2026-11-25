import { useEffect, useRef } from 'react';
import {
  DIETARY_OPTIONS,
  hasAllergy,
  MAX_REQUIREMENTS_COUNT,
  type DietaryCode,
} from '@mountain-hut/shared';
import { emptyDraft, toRequirement, type RequirementDraft } from '../lib/requirements.ts';
import { DietaryIcon, OtherNeedIcon } from './DietaryIcons.tsx';
import { useToast } from './Toast.tsx';
import './RequirementsEditor.css';

interface RequirementsEditorProps {
  value: RequirementDraft[];
  onChange: (rows: RequirementDraft[]) => void;
  /** Error message per row, keyed by RequirementDraft.key. */
  errors?: Partial<Record<number, string>>;
}

const nextKey = (rows: RequirementDraft[]): number =>
  rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;

const toggle = (codes: DietaryCode[], code: DietaryCode): DietaryCode[] =>
  codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];

export function RequirementsEditor({ value, onChange, errors }: RequirementsEditorProps) {
  const toast = useToast();
  // The latest rows and handler, read by an Undo pressed after later edits.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  // Undo toasts of this editor: they make no sense once the form is gone.
  const undoToasts = useRef<number[]>([]);
  // The row whose Other was just ticked: its text field takes the focus once shown.
  const focusOther = useRef<number | null>(null);
  useEffect(() => {
    const ids = undoToasts.current;
    return () => ids.forEach((id) => toast.dismiss(id));
  }, [toast]);

  function remove(row: RequirementDraft, index: number) {
    onChange(value.filter((r) => r.key !== row.key));
    const id = toast.show({
      message: hasAllergy(toRequirement(row))
        ? 'Allergy requirement removed.'
        : 'Requirement removed.',
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
      onClick={() => onChange([...value, emptyDraft(nextKey(value))])}
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
          <p className="field__hint">
            Add one entry for each person or group with the same needs. Pick the needs from the
            list, or choose Other for one that is not there.
          </p>
        </div>
        {value.length === 0 && addButton}
      </div>

      {value.map((row, index) => {
        const id = `requirement-${row.key}`;
        const otherId = `${id}-other`;
        const error = errors?.[row.key];
        const errorId = `${id}-error`;
        return (
          // The legend names the group: the controls inside keep short names
          // ("Gluten-free", "Other", "Remove") so each one is found without ambiguity.
          <fieldset
            key={row.key}
            className="requirement"
            data-testid="requirement-row"
            aria-describedby={error ? errorId : undefined}
          >
            <legend className="field__label requirement__legend">Requirement {index + 1}</legend>

            <div className="diet-options">
              {DIETARY_OPTIONS.map((option) => (
                <label key={option.code} className="diet-option">
                  <input
                    type="checkbox"
                    className="diet-option__input"
                    checked={row.restrictions.includes(option.code)}
                    onChange={() =>
                      update(row.key, { restrictions: toggle(row.restrictions, option.code) })
                    }
                  />
                  <DietaryIcon code={option.code} className="diet-option__icon" />
                  <span className="diet-option__label">{option.label}</span>
                </label>
              ))}
              <label className="diet-option">
                <input
                  type="checkbox"
                  className="diet-option__input"
                  checked={row.other}
                  aria-controls={row.other ? otherId : undefined}
                  onChange={(e) => {
                    focusOther.current = e.target.checked ? row.key : null;
                    update(row.key, { other: e.target.checked });
                  }}
                />
                <OtherNeedIcon className="diet-option__icon" />
                <span className="diet-option__label">Other</span>
              </label>
            </div>

            {row.other && (
              <div id={otherId} className="requirement__other">
                <label htmlFor={id}>Other need</label>
                <div className="requirement__row">
                  <input
                    id={id}
                    ref={(el) => {
                      if (el && focusOther.current === row.key) {
                        focusOther.current = null;
                        el.focus();
                      }
                    }}
                    type="text"
                    className="requirement__input"
                    value={row.description}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    placeholder="e.g. shellfish, vegetarian"
                    onChange={(e) => update(row.key, { description: e.target.value })}
                  />
                  <label className="requirement__allergy">
                    <input
                      type="checkbox"
                      checked={row.allergies}
                      onChange={(e) => update(row.key, { allergies: e.target.checked })}
                    />
                    Allergy or intolerance
                  </label>
                </div>
              </div>
            )}

            {error && (
              <p id={errorId} role="alert" className="field-error">
                {error}
              </p>
            )}

            <button
              type="button"
              className="requirement__remove"
              onClick={() => remove(row, index)}
            >
              Remove
            </button>
          </fieldset>
        );
      })}

      {value.length > 0 && addButton}
    </div>
  );
}
