import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  hikeMoment,
  MAX_HIKE_DESTINATION_LENGTH,
  MAX_HIKE_PASSAGE_POINT_LENGTH,
  MAX_HIKE_ROUTE_LENGTH,
  registerHikeSchema,
  type PredefinedHike,
} from '@mountain-hut/shared';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { usePredefinedHikes, useRegisterHike } from '../api/useHikes.ts';
import { DateField } from '../components/DateField.tsx';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { FormField } from '../components/FormField.tsx';
import { HutHero } from '../components/HutHero.tsx';
import { PassagePointsEditor, type PassagePointDraft } from '../components/PassagePointsEditor.tsx';
import { TimeField } from '../components/TimeField.tsx';
import { useToast } from '../components/Toast.tsx';
import { dateFull, fromIsoDate, toIsoDate } from '../lib/dates.ts';
import { apiErrorMessage } from '../lib/errors.ts';
import { normalizeTime } from '../lib/time.ts';
import './BookingPage.css';
import './RegisterHikePage.css';

type Field =
  'destination' | 'route' | 'departureDate' | 'departureTime' | 'returnDate' | 'returnTime';
type FieldErrors = Partial<Record<Field, string>>;

const REQUIRED: Record<Field, string> = {
  destination: 'Enter the destination of the hike.',
  route: 'Describe the route you will take.',
  departureDate: 'Choose the departure date.',
  departureTime: 'Enter the departure time as hh:mm.',
  returnDate: 'Choose the expected return date.',
  returnTime: 'Enter the expected return time as hh:mm.',
};
const TOO_LONG: Partial<Record<Field, string>> = {
  destination: `Use at most ${MAX_HIKE_DESTINATION_LENGTH} characters.`,
  route: `Use at most ${MAX_HIKE_ROUTE_LENGTH} characters.`,
};
const RETURN_BEFORE_DEPARTURE = 'The expected return must be after the planned departure.';
const DEPARTURE_PAST = 'The planned departure must be in the future.';
const POINT_EMPTY = 'Enter the name of the place, or remove this passage point.';
// Next to the button: the red fields may be out of sight, and the button must not look dead.
const FIX_FIELDS = 'Some fields need a fix: see the messages in the form.';

// The fields in the order of the form, to bring the first one with an error into view.
const FIELD_IDS: Record<Field, string> = {
  destination: 'hike-destination',
  route: 'hike-route',
  departureDate: 'hike-departure-date',
  departureTime: 'hike-departure-time',
  returnDate: 'hike-return-date',
  returnTime: 'hike-return-time',
};
const POINT_TOO_LONG = `Use at most ${MAX_HIKE_PASSAGE_POINT_LENGTH} characters.`;

const pad = (n: number): string => String(n).padStart(2, '0');
const nowMoment = (now: Date): string =>
  hikeMoment(toIsoDate(now), `${pad(now.getHours())}:${pad(now.getMinutes())}`);

// "2 h 30 min", "1 day 4 h": how long the hiker expects to be away.
function duration(from: string, to: string): string | null {
  const minutes = (Date.parse(to) - Date.parse(from)) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  const parts = [
    days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
    hours > 0 ? `${hours} h` : null,
    mins > 0 ? `${mins} min` : null,
  ];
  return parts.filter(Boolean).join(' ');
}

const shownMoment = (date: string, time: string): string | null =>
  date && /^\d{2}:\d{2}$/.test(time) ? `${dateFull(fromIsoDate(date))}, ${time}` : null;

// The API explains these: no hiker profile, unknown predefined hike, overlap, departure come.
const registerError = (e: unknown): string =>
  apiErrorMessage(e, 'The hike could not be registered. Please try again.', [403, 404, 409, 422]);

interface PredefinedChooserProps {
  chosenId: number | null;
  onChoose: (hike: PredefinedHike) => void;
  onClear: () => void;
}

// MH-20 (issue #49): start from one of the hut's popular hikes, then change what you need.
function PredefinedChooser({ chosenId, onChoose, onClear }: PredefinedChooserProps) {
  const predefined = usePredefinedHikes();

  if (predefined.isPending) return <p role="status">Loading the hut&apos;s hikes…</p>;
  if (predefined.isError) return <ErrorNotice message={registerError(predefined.error)} />;
  if (predefined.data.length === 0) return null;

  return (
    <section className="hike-presets" aria-labelledby="hike-presets-title">
      <div className="field__head">
        <h3 id="hike-presets-title" className="field__label">
          Start from a popular hike
        </h3>
        {chosenId !== null && (
          <button type="button" className="hike-presets__clear" onClick={onClear}>
            Start from scratch
          </button>
        )}
      </div>
      <p className="field__hint">Choosing one fills the form below: you can still change it.</p>
      <ul className="hike-presets__list">
        {predefined.data.map((hike) => (
          <li key={hike.id}>
            <button
              type="button"
              className="hike-presets__option"
              aria-pressed={hike.id === chosenId}
              onClick={() => onChoose(hike)}
            >
              <strong>{hike.destination}</strong>
              <span>{hike.route}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RegisterHikeForm({ onReset }: { onReset: () => void }) {
  const registerHike = useRegisterHike();
  const toast = useToast();
  const navigate = useNavigate();
  const [today] = useState(() => toIsoDate(new Date()));
  const [predefinedHikeId, setPredefinedHikeId] = useState<number | null>(null);
  const [destination, setDestination] = useState('');
  const [route, setRoute] = useState('');
  const [points, setPoints] = useState<PassagePointDraft[]>([]);
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pointErrors, setPointErrors] = useState<Partial<Record<number, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // The field to focus once the errors are on screen.
  const focusAfterRender = useRef<string | null>(null);
  useEffect(() => {
    if (focusAfterRender.current === null) return;
    document.getElementById(focusAfterRender.current)?.focus();
    focusAfterRender.current = null;
  });
  // Only messages on screen count: choosing a popular hike clears some errors to undefined.
  const needsFix = Object.values(errors).some(Boolean) || Object.values(pointErrors).some(Boolean);

  function choose(hike: PredefinedHike) {
    setPredefinedHikeId(hike.id);
    setDestination(hike.destination);
    setRoute(hike.route);
    setPoints(hike.passagePoints.map((value, i) => ({ key: i + 1, value })));
    setErrors((e) => ({ ...e, destination: undefined, route: undefined }));
    setPointErrors({});
  }

  function clearChoice() {
    setPredefinedHikeId(null);
    setDestination('');
    setRoute('');
    setPoints([]);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setPointErrors({});
    setFormError(null);

    const input = {
      destination,
      route,
      passagePoints: points.map((p) => p.value),
      departureDate,
      departureTime: normalizeTime(departureTime),
      returnDate,
      returnTime: normalizeTime(returnTime),
      ...(predefinedHikeId === null ? {} : { predefinedHikeId }),
    };
    const parsed = registerHikeSchema.safeParse(input);

    const found: FieldErrors = {};
    const foundPoints: Partial<Record<number, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [field, index] = issue.path;
        if (field === 'passagePoints' && typeof index === 'number') {
          foundPoints[points[index].key] ??=
            issue.code === 'too_big' ? POINT_TOO_LONG : POINT_EMPTY;
        } else if (issue.code === 'custom' && field === 'returnTime') {
          found.returnTime ??= RETURN_BEFORE_DEPARTURE;
        } else if (field in REQUIRED) {
          const key = field as Field;
          found[key] ??= (issue.code === 'too_big' ? TOO_LONG[key] : undefined) ?? REQUIRED[key];
        }
      }
    }
    // The hut checks it too (in its own time zone); here it saves a round trip.
    if (!found.departureDate && !found.departureTime) {
      if (hikeMoment(departureDate, input.departureTime) <= nowMoment(new Date())) {
        found.departureTime = DEPARTURE_PAST;
      }
    }
    if (Object.keys(found).length > 0 || Object.keys(foundPoints).length > 0 || !parsed.success) {
      setErrors(found);
      setPointErrors(foundPoints);
      // The focus goes to the first field to fix, which also scrolls it into view.
      const order: string[] = [
        ...(['destination', 'route'] as const).filter((f) => found[f]).map((f) => FIELD_IDS[f]),
        ...points.filter((p) => foundPoints[p.key]).map((p) => `passage-point-${p.key}`),
        ...(['departureDate', 'departureTime', 'returnDate', 'returnTime'] as const)
          .filter((f) => found[f])
          .map((f) => FIELD_IDS[f]),
      ];
      focusAfterRender.current = order[0] ?? null;
      return;
    }

    registerHike.mutate(parsed.data, {
      // A short outcome: a toast, with the way to the hike in the personal area.
      onSuccess: (hike) => {
        toast.show({
          message: `Hike registered: ${hike.destination}, ${dateFull(fromIsoDate(hike.departureDate))} at ${hike.departureTime}.`,
          action: { label: 'View my hikes', onClick: () => void navigate('/hikes') },
        });
        onReset();
      },
      onError: (err) => setFormError(registerError(err)),
    });
  }

  const departure = shownMoment(departureDate, normalizeTime(departureTime));
  const expectedReturn = shownMoment(returnDate, normalizeTime(returnTime));
  const away =
    departure && expectedReturn
      ? duration(
          hikeMoment(departureDate, normalizeTime(departureTime)),
          hikeMoment(returnDate, normalizeTime(returnTime)),
        )
      : null;
  const filledPoints = points.map((p) => p.value.trim()).filter(Boolean);

  return (
    <form className="layout" onSubmit={onSubmit} noValidate>
      <div className="layout__form">
        <PredefinedChooser chosenId={predefinedHikeId} onChoose={choose} onClear={clearChoice} />

        <section className="hike-section" aria-labelledby="hike-where-title">
          <h3 id="hike-where-title" className="field__label">
            Where you are going
          </h3>
          <FormField
            id="hike-destination"
            label="Destination *"
            placeholder="e.g. Monte Vettore"
            maxLength={MAX_HIKE_DESTINATION_LENGTH}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            error={errors.destination}
          />
          <div className="field">
            <label htmlFor="hike-route">Route *</label>
            <textarea
              id="hike-route"
              placeholder="e.g. From Forca di Presta via Rifugio Zilioli"
              maxLength={MAX_HIKE_ROUTE_LENGTH}
              value={route}
              aria-invalid={errors.route ? true : undefined}
              aria-describedby="hike-route-hint"
              onChange={(e) => setRoute(e.target.value)}
            />
            <p id="hike-route-hint" className="field__hint">
              How you will get there, in a few words.
            </p>
            {errors.route && (
              <p role="alert" className="field-error">
                {errors.route}
              </p>
            )}
          </div>
          <PassagePointsEditor value={points} onChange={setPoints} errors={pointErrors} />
        </section>

        <section className="hike-section" aria-labelledby="hike-when-title">
          <h3 id="hike-when-title" className="field__label">
            When
          </h3>
          <div className="hike-section__row">
            <DateField
              id="hike-departure-date"
              label="Departure date *"
              min={today}
              value={departureDate}
              onChange={(iso) => {
                setDepartureDate(iso);
                // Most hikes come back on the same day.
                if (!returnDate || returnDate < iso) setReturnDate(iso);
              }}
              error={errors.departureDate}
            />
            <TimeField
              id="hike-departure-time"
              label="Departure time *"
              value={departureTime}
              onChange={setDepartureTime}
              error={errors.departureTime}
            />
          </div>
          <div className="hike-section__row">
            <DateField
              id="hike-return-date"
              label="Expected return date *"
              min={departureDate || today}
              value={returnDate}
              onChange={setReturnDate}
              error={errors.returnDate}
            />
            <TimeField
              id="hike-return-time"
              label="Expected return time *"
              value={returnTime}
              onChange={setReturnTime}
              error={errors.returnTime}
            />
          </div>
          <p className="field__hint">Times are the hut&apos;s local time.</p>
        </section>
      </div>

      <aside className="layout__side">
        <div className="summary hike-summary">
          <p className="summary__title">Your hike</p>
          <dl className="hike-summary__list">
            <div>
              <dt>Destination</dt>
              <dd>{destination.trim() || '—'}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{route.trim() || '—'}</dd>
            </div>
            {filledPoints.length > 0 && (
              <div>
                <dt>Passage points</dt>
                <dd>{filledPoints.join(' → ')}</dd>
              </div>
            )}
            <div>
              <dt>Departure</dt>
              <dd>{departure ?? '—'}</dd>
            </div>
            <div>
              <dt>Expected return</dt>
              <dd>{expectedReturn ?? '—'}</dd>
            </div>
            {away && (
              <div>
                <dt>Away for</dt>
                <dd>{away}</dd>
              </div>
            )}
          </dl>
          <hr className="summary__rule" />
          {formError && <ErrorNotice message={formError} className="hike-summary__error" />}
          <button type="submit" className="cta cta--center" disabled={registerHike.isPending}>
            {registerHike.isPending ? 'Registering…' : 'Register the hike'}
          </button>
          {needsFix && (
            <p role="alert" className="field-error hike-summary__fix">
              {FIX_FIELDS}
            </p>
          )}
          <p className="field__hint hike-summary__note">
            The hut uses these details only if you do not return as expected. * Required fields
          </p>
        </div>
      </aside>
    </form>
  );
}

// MH-20: a hiker registers a planned hike before departure.
export function RegisterHikePage() {
  const { data: user, isPending } = useCurrentUser();
  // A new key empties the form after each registration.
  const [formKey, setFormKey] = useState(0);

  let content: ReactNode;
  if (isPending) {
    content = <p role="status">Loading…</p>;
  } else if (!user) {
    content = (
      <p className="notice notice--ok">
        <Link to="/login?next=%2Fhikes%2Fnew">Sign in</Link> to register a hike.
      </p>
    );
  } else if (isStaff(user)) {
    content = <p className="notice notice--ok">Staff accounts cannot register a hike.</p>;
  } else {
    content = <RegisterHikeForm key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
  }

  return (
    <div className="page">
      <HutHero />
      <div className="page__body">
        <h2 className="page__title">Register a hike</h2>
        <p className="page__subtitle">
          Tell the hut where you are going and when you expect to be back.
        </p>
        {content}
      </div>
    </div>
  );
}
