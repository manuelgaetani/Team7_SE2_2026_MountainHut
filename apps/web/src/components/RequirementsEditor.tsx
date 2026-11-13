import { MAX_REQUIREMENT_LENGTH, MAX_REQUIREMENTS } from '@mountain-hut/shared';

// A requirement as edited in the form. The key only identifies the row in the list.
export interface RequirementDraft {
  key: number;
  allergies: boolean;
  description: string;
}

interface RequirementsEditorProps {
  value: RequirementDraft[];
  onChange: (rows: RequirementDraft[]) => void;
}

const nextKey = (rows: RequirementDraft[]): number =>
  rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;

export function RequirementsEditor({ value, onChange }: RequirementsEditorProps) {
  const update = (key: number, patch: Partial<RequirementDraft>) =>
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <section className="field" aria-labelledby="requirements-label">
      <h3 id="requirements-label" className="field__label">
        Dietary requirements
      </h3>
      <p className="field__hint">Add one entry for each person or group with the same needs.</p>

      {value.map((row, index) => {
        const id = `requirement-${row.key}`;
        const n = index + 1;
        return (
          <div key={row.key} className="requirement">
            <div className="requirement__head">
              <label htmlFor={id} className="field__label">
                Requirement {n}
              </label>
              <button
                type="button"
                className="requirement__remove"
                aria-label={`Remove requirement ${n}`}
                onClick={() => onChange(value.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            </div>
            <div className="requirement__row">
              <input
                id={id}
                type="text"
                className="requirement__input"
                value={row.description}
                maxLength={MAX_REQUIREMENT_LENGTH}
                placeholder="e.g. 2 vegetarians"
                onChange={(e) => update(row.key, { description: e.target.value })}
              />
              <label className="requirement__allergy">
                <input
                  type="checkbox"
                  checked={row.allergies}
                  aria-label={`Allergies, requirement ${n}`}
                  onChange={(e) => update(row.key, { allergies: e.target.checked })}
                />
                Allergies
              </label>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        className="pill"
        disabled={value.length >= MAX_REQUIREMENTS}
        onClick={() =>
          onChange([...value, { key: nextKey(value), allergies: false, description: '' }])
        }
      >
        {value.length === 0 ? 'Add a requirement' : 'Add another requirement'}
      </button>
      <p className="field__hint">
        For each entry, say how many people it applies to. Tick “Allergies” only when the kitchen
        needs to take special care.
      </p>
    </section>
  );
}
