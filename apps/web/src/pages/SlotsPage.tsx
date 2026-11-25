import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SlotDetails } from '../api/slots.ts';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useIsSavingMenu } from '../api/useMenus.ts';
import { useSchedule } from '../api/useSlots.ts';
import { DefineTablesForm } from '../components/DefineTablesForm.tsx';
import { DateField } from '../components/DateField.tsx';
import { MenuEditor } from '../components/MenuEditor.tsx';
import { NewSlotForm } from '../components/NewSlotForm.tsx';
import { RepeatWeeklyScheduleDialog } from '../components/RepeatWeeklyScheduleDialog.tsx';
import { SlotSchedule } from '../components/SlotSchedule.tsx';
import { isIsoDate, toIsoDate } from '../lib/dates.ts';
import { slotErrorMessage } from '../lib/slotTables.ts';
import './BookingPage.css';
import './SlotsPage.css';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { useToast } from '../components/Toast.tsx';

function SlotsManager() {
  // The day comes from ?date= when the staff return from a floor plan; otherwise it is today.
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => {
    const fromUrl = searchParams.get('date');
    return isIsoDate(fromUrl) ? fromUrl : toIsoDate(new Date());
  });
  // What the side panel shows instead of the new slot form.
  const [side, setSide] = useState<{ kind: 'tables' | 'menu'; slot: SlotDetails } | null>(null);
  // Unsaved edits of the menu: leaving them asks first (guides/08, unsaved changes).
  const [menuDirty, setMenuDirty] = useState(false);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const onMenuDirty = useCallback((dirty: boolean) => setMenuDirty(dirty), []);
  const saving = useIsSavingMenu();
  const keepRef = useRef<HTMLButtonElement>(null);
  // While a menu is being saved nothing switches: its confirmation must still be shown.
  const guard = (run: () => void) => {
    if (saving) return;
    if (menuDirty) setPending({ run });
    else run();
  };

  // The safe answer takes the focus every time the question is asked, and Escape keeps editing.
  useEffect(() => {
    if (!pending) return;
    keepRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pending]);
  const [repeating, setRepeating] = useState(false);
  const schedule = useSchedule(date);
  const toast = useToast();

  return (
    <div className="layout layout--staff">
      <div className="layout__form">
        <DateField
          id="schedule-date"
          label="Day"
          value={date}
          onChange={(iso) =>
            guard(() => {
              setDate(iso);
              setSide(null);
            })
          }
        />
        <div className="schedule-toolbar">
          <button type="button" className="pill" onClick={() => setRepeating(true)}>
            Repeat weekly schedule
          </button>
        </div>
        {schedule.isPending && <p role="status">Loading the slots of the day…</p>}
        {schedule.isError && <ErrorNotice message={slotErrorMessage(schedule.error)} />}
        {schedule.isSuccess && (
          <SlotSchedule
            slots={schedule.data}
            onDefineTables={(slot) => guard(() => setSide({ kind: 'tables', slot }))}
            onDefineMenu={(slot) => {
              // The menu of this slot is already open: nothing to switch, nothing to discard.
              if (side?.kind === 'menu' && side.slot.id === slot.id) return;
              guard(() => setSide({ kind: 'menu', slot }));
            }}
          />
        )}
      </div>

      <div className="layout__side">
        {pending && (
          <div
            className="summary menu-editor__discard"
            role="alertdialog"
            aria-labelledby="menu-leave"
          >
            <p id="menu-leave" className="modify-dialog__discard-title">
              Discard your changes to the menu?
            </p>
            <div className="menu-editor__actions">
              <button ref={keepRef} type="button" className="pill" onClick={() => setPending(null)}>
                Keep editing
              </button>
              <button
                type="button"
                className="pill menu-editor__danger"
                onClick={() => {
                  // The editor unmounts and clears the dirty flag itself.
                  setPending(null);
                  pending.run();
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {side?.kind === 'tables' && (
          <DefineTablesForm
            key={side.slot.id}
            slot={side.slot}
            onDone={(message) => {
              setSide(null);
              toast.show({ message });
            }}
            onCancel={() => setSide(null)}
          />
        )}
        {side?.kind === 'menu' && (
          // Under the question the editor cannot be used, so only one question is open at a time.
          <div inert={pending !== null}>
            <MenuEditor
              key={side.slot.id}
              slot={side.slot}
              onDirtyChange={onMenuDirty}
              onDone={(message) => {
                setSide(null);
                toast.show({ message });
              }}
              onClose={() => setSide(null)}
            />
          </div>
        )}
        {side === null && <NewSlotForm key={date} date={date} />}
      </div>
      {repeating && (
        <RepeatWeeklyScheduleDialog
          sourceStartDate={date}
          onDone={(message) => {
            setRepeating(false);
            toast.show({ message });
          }}
          onClose={() => setRepeating(false)}
        />
      )}
    </div>
  );
}

// MH-02: the staff define the time slots and the tables and seats of each one.
export function SlotsPage() {
  const { data: user, isPending } = useCurrentUser();

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Sign in</Link> with a staff account to manage the time slots.
        </p>
      );
    } else if (!isStaff(user)) {
      content = <p className="notice notice--ok">This page is for the hut staff.</p>;
    } else {
      content = <SlotsManager />;
    }
  }

  return (
    <div className="page">
      <div className="page__body">
        <h2 className="page__title">Time slots and tables</h2>
        <p className="page__subtitle">
          Set the tables and seats of each time slot, so the hut never takes more guests than it can
          serve.
        </p>
        {content}
      </div>
    </div>
  );
}
