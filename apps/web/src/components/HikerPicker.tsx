import { MIN_HIKER_SEARCH_LENGTH } from '@mountain-hut/shared';
import { useHikerSearch } from '../api/useStaffBookings.ts';
import { useDebouncedValue } from '../lib/useDebouncedValue.ts';
import type { FieldErrors, HikerDraft, HikerMode } from '../lib/hikerDraft.ts';
import { FormField } from './FormField.tsx';

const MODES: { mode: HikerMode; label: string }[] = [
  { mode: 'EXISTING', label: 'Existing hiker' },
  { mode: 'TEMPORARY', label: 'Quick entry' },
  { mode: 'ACCOUNT', label: 'Full profile' },
];

const SEARCH_DELAY_MS = 300;

const firstName = (fullName: string): string => fullName.split(' ')[0] ?? fullName;
const hikersLabel = (n: number): string => (n === 1 ? '1 matching hiker' : `${n} matching hikers`);

interface HikerPickerProps {
  value: HikerDraft;
  onChange: (draft: HikerDraft) => void;
  errors: FieldErrors;
}

export function HikerPicker({ value, onChange, errors }: HikerPickerProps) {
  const set = (patch: Partial<HikerDraft>) => onChange({ ...value, ...patch });

  return (
    <section className="card" aria-labelledby="hiker-title">
      <h2 id="hiker-title" className="card__title">
        1. Hiker
      </h2>

      <div className="segmented" role="group" aria-label="Kind of hiker">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className="segmented__option"
            aria-pressed={value.mode === mode}
            onClick={() => set({ mode })}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === 'EXISTING' && <ExistingHiker value={value} set={set} errors={errors} />}
      {value.mode === 'TEMPORARY' && <QuickEntry value={value} set={set} errors={errors} />}
      {value.mode === 'ACCOUNT' && <FullProfile value={value} set={set} errors={errors} />}
    </section>
  );
}

interface SectionProps {
  value: HikerDraft;
  set: (patch: Partial<HikerDraft>) => void;
  errors: FieldErrors;
}

function ExistingHiker({ value, set, errors }: SectionProps) {
  const search = useDebouncedValue(value.search, SEARCH_DELAY_MS);
  const hikers = useHikerSearch(search);
  const tooShort = search.trim().length < MIN_HIKER_SEARCH_LENGTH;
  const selected = value.selected;

  return (
    <>
      <FormField
        id="hiker-search"
        label="Search by name, phone or email"
        type="search"
        placeholder="e.g. Rossi"
        value={value.search}
        onChange={(e) => set({ search: e.target.value })}
        error={errors.hikerId}
      />

      {!tooShort && hikers.isPending && <p role="status">Searching hikers…</p>}
      {hikers.isError && (
        <p role="alert" className="notice notice--error">
          The search failed. Please try again.
        </p>
      )}
      {!tooShort && hikers.isSuccess && hikers.data.length === 0 && (
        <p className="notice notice--ok">
          No hiker matches “{search.trim()}”. Add them with Quick entry or Full profile.
        </p>
      )}
      {!tooShort && hikers.isSuccess && hikers.data.length > 0 && (
        <>
          <p className="card__hint">{hikersLabel(hikers.data.length)} · Select a profile</p>
          <ul className="hiker-list" aria-label="Matching hikers">
            {hikers.data.map((hiker) => {
              const isSelected = selected?.id === hiker.id;
              return (
                <li
                  key={hiker.id}
                  className={`hiker-list__item${isSelected ? ' hiker-list__item--selected' : ''}`}
                >
                  <div>
                    <strong className="hiker-list__name">{hiker.fullName}</strong>
                    <span className="hiker-list__meta">
                      {[hiker.email, hiker.phone].filter(Boolean).join(' · ')}
                      {hiker.temporary && ' · Temporary'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`chip${isSelected ? ' chip--active' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`Select ${hiker.fullName}`}
                    onClick={() => set({ selected: isSelected ? null : hiker })}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selected && (
        <>
          <div className="hiker-profile">
            <p className="hiker-profile__title">{firstName(selected.fullName)}&apos;s profile</p>
            {selected.notes && <p>Notes: {selected.notes}</p>}
            {selected.emergencyContact && <p>Emergency contact: {selected.emergencyContact}</p>}
          </div>
          <div className="info-box">
            <strong>Existing profile</strong>
            <span>
              This booking will be added to {firstName(selected.fullName)}&apos;s reservations.
            </span>
          </div>
        </>
      )}
    </>
  );
}

function QuickEntry({ value, set, errors }: SectionProps) {
  return (
    <>
      <p className="card__hint">For a quick booking, only the hiker&apos;s name is required.</p>
      <FormField
        id="quick-full-name"
        label="Full name *"
        value={value.fullName}
        onChange={(e) => set({ fullName: e.target.value })}
        error={errors.fullName}
      />
      <FormField
        id="quick-phone"
        label="Mobile number (optional)"
        type="tel"
        value={value.phone}
        onChange={(e) => set({ phone: e.target.value })}
        error={errors.phone}
      />
      <div className="info-box">
        <strong>Temporary hiker · No web access</strong>
        <span>
          Only the name and optional phone number will be saved. This hiker cannot log in or manage
          bookings online.
        </span>
      </div>
      <p className="card__hint">Need a regular profile with web access? Choose Full profile.</p>
    </>
  );
}

function FullProfile({ value, set, errors }: SectionProps) {
  return (
    <>
      <p className="card__hint">Create a regular hiker profile with access to the web interface.</p>
      <FormField
        id="full-name"
        label="Full name *"
        value={value.fullName}
        onChange={(e) => set({ fullName: e.target.value })}
        error={errors.fullName}
      />
      <div className="card__row">
        <FormField
          id="full-email"
          label="Email *"
          type="email"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          error={errors.email}
        />
        <FormField
          id="full-phone"
          label="Mobile number *"
          type="tel"
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
          error={errors.phone}
        />
      </div>
      <FormField
        id="full-notes"
        label="Notes (optional)"
        value={value.notes}
        onChange={(e) => set({ notes: e.target.value })}
        error={errors.notes}
      />
      <FormField
        id="full-emergency"
        label="Emergency contact (optional)"
        value={value.emergencyContact}
        onChange={(e) => set({ emergencyContact: e.target.value })}
        error={errors.emergencyContact}
      />
      <div className="info-box">
        <strong>Regular hiker · Web access</strong>
        <span>
          The full profile will be saved with this booking. The hiker can use the system&apos;s web
          interface.
        </span>
      </div>
    </>
  );
}
