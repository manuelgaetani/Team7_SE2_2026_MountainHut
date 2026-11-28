import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { defineMenuSchema } from '@mountain-hut/shared';
import type { SlotDetails } from '../api/slots.ts';
import { useDeleteSlotMenu, usePastMenus, useSaveSlotMenu, useSlotMenu } from '../api/useMenus.ts';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import { apiErrorMessage } from '../lib/errors.ts';
import {
  cleanCourses,
  courseKey,
  DEFAULT_COURSES,
  dishKey,
  MAX_COURSES,
  MAX_DISHES,
  MENU_MARKS,
  menuErrors,
  parsePrice,
  type MenuCourse,
  type MenuMark,
  type PastMenu,
  type SlotMenu,
} from '../lib/menu.ts';
import { menuToText } from '../lib/menuFormat.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';
import { FormField } from './FormField.tsx';
import { FormDialog } from './FormDialog.tsx';
import { MenuMarkIcon } from './MenuIcons.tsx';
import { MenuTextField } from './MenuTextField.tsx';
import { useToast } from './Toast.tsx';
import './Menu.css';
import './RequirementsEditor.css';
import './ModifyBookingDialog.css';

// A dish as edited: the price stays as typed until the menu is saved.
interface DishDraft {
  key: number;
  name: string;
  translation: string;
  price: string;
  description: string;
  marks: MenuMark[];
}
interface CourseDraft {
  key: number;
  name: string;
  dishes: DishDraft[];
}

let lastKey = 0;
const nextKey = () => ++lastKey;

const emptyDishDraft = (): DishDraft => ({
  key: nextKey(),
  name: '',
  translation: '',
  price: '',
  description: '',
  marks: [],
});

const toDrafts = (courses: MenuCourse[]): CourseDraft[] =>
  courses.map((c) => ({
    key: nextKey(),
    name: c.name,
    dishes: c.dishes.map((d) => ({
      key: nextKey(),
      name: d.name,
      translation: d.translation,
      price: String(d.price),
      description: d.description,
      marks: [...d.marks],
    })),
  }));

const emptyMenu = (): CourseDraft[] =>
  DEFAULT_COURSES.map((name) => ({ key: nextKey(), name, dishes: [] }));

const toCourses = (drafts: CourseDraft[]): MenuCourse[] =>
  drafts.map((c) => ({
    name: c.name,
    dishes: c.dishes.map((d) => ({
      name: d.name,
      translation: d.translation,
      price: parsePrice(d.price),
      description: d.description,
      marks: d.marks,
    })),
  }));

// What a past menu is called in the "Start from" list: "Sun 22 Nov · 12:00–14:00".
const menuName = (m: PastMenu): string =>
  `${dateShort(fromIsoDate(m.date))} · ${m.startTime}–${m.endTime}`;

const toggle = (marks: MenuMark[], mark: MenuMark): MenuMark[] =>
  marks.includes(mark) ? marks.filter((m) => m !== mark) : [...marks, mark];

interface MenuEditorProps {
  slot: SlotDetails;
  // Called with a short confirmation once the menu is saved or deleted.
  onDone: (message: string) => void;
  onClose: () => void;
}

function MenuHeading({ slot }: { slot: SlotDetails }) {
  return (
    <>
      <p className="modify-dialog__eyebrow">Time slot menu</p>
      <h2 id="menu-editor-title" className="dialog__title">
        Menu for {slot.startTime}–{slot.endTime}
      </h2>
      <p className="modify-dialog__subtitle">
        {dateShort(fromIsoDate(slot.date))}. A few dishes of quality: mark what each one contains,
        so hikers with allergies can choose.
      </p>
    </>
  );
}

// MH-10: the staff write the menu of a slot, or start from one written before.
export function MenuEditor(props: MenuEditorProps) {
  const saved = useSlotMenu(props.slot.id);

  if (saved.isSuccess) return <MenuForm {...props} saved={saved.data} />;
  return (
    <FormDialog onClose={props.onClose} labelledBy="menu-editor-title" className="menu-dialog">
      <MenuHeading slot={props.slot} />
      {saved.isPending ? (
        <p role="status">Loading the menu…</p>
      ) : (
        <ErrorNotice message="Could not load the menu. Please try again." />
      )}
      <div className="modify-dialog__actions menu-dialog__actions--single">
        <button type="button" className="modify-dialog__secondary" onClick={props.onClose}>
          Close
        </button>
      </div>
    </FormDialog>
  );
}

function MenuForm({ slot, saved, onDone, onClose }: MenuEditorProps & { saved: SlotMenu | null }) {
  const save = useSaveSlotMenu();
  const remove = useDeleteSlotMenu();
  // While a request is on its way the dialog stays open and the menu as it is.
  const busy = save.isPending || remove.isPending;
  const past = usePastMenus();
  const time = `${slot.startTime}–${slot.endTime}`;
  // The courses of this slot's menu; null without a menu, or for a free text sent straight to
  // the API, which the editor cannot open (saving replaces it).
  const savedCourses = saved?.courses ?? null;
  const [original] = useState(() => (savedCourses ? toDrafts(savedCourses) : emptyMenu()));
  const [courses, setCourses] = useState<CourseDraft[]>(original);
  const [startFrom, setStartFrom] = useState(savedCourses ? 'saved' : 'empty');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  // A pending choice that waits for the answer to "Discard your changes?" or "Delete this menu?".
  const [confirming, setConfirming] = useState<
    { kind: 'close' } | { kind: 'start'; value: string } | { kind: 'delete' } | null
  >(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  // A course or a dish that waits for the answer to "Remove this course/dish?".
  const [removing, setRemoving] = useState<
    | { kind: 'course'; course: CourseDraft; index: number }
    | { kind: 'dish'; course: CourseDraft; dish: DishDraft; index: number }
    | null
  >(null);

  // Stable, so the question does not register its Escape key again on every render.
  const keepRemoving = useCallback(() => setRemoving(null), []);

  // Edits reverted to the original values do not count.
  const dirty = JSON.stringify(toCourses(courses)) !== JSON.stringify(toCourses(original));

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  // Previous menus written with the editor; free texts cannot be opened in it.
  const others = (past.data ?? []).filter(
    (m): m is PastMenu & { courses: MenuCourse[] } => m.slotId !== slot.id && m.courses !== null,
  );

  const toast = useToast();
  // Undo toasts of this editor: they make no sense once the editor is closed.
  const undoToasts = useRef<number[]>([]);
  useEffect(() => {
    const ids = undoToasts.current;
    return () => ids.forEach((id) => toast.dismiss(id));
  }, [toast]);

  // Puts back what was removed, at the same place, on the latest version of the menu.
  function showUndo(message: string, restore: (latest: CourseDraft[]) => CourseDraft[]) {
    const id = toast.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => {
          setCourses(restore);
          setErrors({});
          setSaveError(null);
        },
      },
    });
    undoToasts.current.push(id);
  }

  function removeCourse(course: CourseDraft, index: number) {
    edit(courses.filter((c) => c.key !== course.key));
    showUndo(
      course.name.trim() ? `Course removed: ${course.name.trim()}.` : 'Course removed.',
      (latest) => {
        if (latest.some((c) => c.key === course.key) || latest.length >= MAX_COURSES) return latest;
        const next = [...latest];
        next.splice(Math.min(index, latest.length), 0, course);
        return next;
      },
    );
  }

  function removeDish(courseKeyValue: number, dish: DishDraft, index: number) {
    edit(
      courses.map((c) =>
        c.key === courseKeyValue ? { ...c, dishes: c.dishes.filter((d) => d.key !== dish.key) } : c,
      ),
    );
    showUndo(dish.name.trim() ? `Dish removed: ${dish.name.trim()}.` : 'Dish removed.', (latest) =>
      latest.map((c) => {
        if (c.key !== courseKeyValue) return c;
        if (c.dishes.some((d) => d.key === dish.key) || c.dishes.length >= MAX_DISHES) return c;
        const dishes = [...c.dishes];
        dishes.splice(Math.min(index, dishes.length), 0, dish);
        return { ...c, dishes };
      }),
    );
  }

  function edit(next: CourseDraft[]) {
    setCourses(next);
    setErrors({});
    setSaveError(null);
  }
  const updateCourse = (key: number, patch: Partial<CourseDraft>) =>
    edit(courses.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateDish = (courseKeyValue: number, dish: number, patch: Partial<DishDraft>) =>
    edit(
      courses.map((c) =>
        c.key === courseKeyValue
          ? { ...c, dishes: c.dishes.map((d) => (d.key === dish ? { ...d, ...patch } : d)) }
          : c,
      ),
    );

  function startWith(value: string) {
    setStartFrom(value);
    setConfirming(null);
    let next: CourseDraft[];
    if (value === 'saved' && savedCourses) next = toDrafts(savedCourses);
    else if (value === 'empty') next = emptyMenu();
    else {
      const source = others.find((m) => String(m.slotId) === value);
      next = source ? toDrafts(source.courses) : emptyMenu();
    }
    edit(next);
  }

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirming({ kind: 'close' });
    else onClose();
  };

  // Escape answers the question first, then asks to close.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      if (confirming) setConfirming(null);
      else if (dirty) setConfirming({ kind: 'close' });
      else onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirming, dirty, onClose, busy]);

  // The staff confirmed: the menu of this slot is deleted, hikers no longer see it.
  function deleteMenu() {
    setSaveError(null);
    remove.mutate(slot.id, {
      onSuccess: () => onDone(`Menu deleted for ${time}.`),
      onError: (e) => {
        setConfirming(null);
        // 422: the slot has started meanwhile; 404: the menu or the slot is already gone.
        setSaveError(
          apiErrorMessage(e, 'The menu could not be deleted. Please try again.', [404, 422]),
        );
      },
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const menu = toCourses(courses);
    const found = menuErrors(menu);
    if (Object.keys(found).length === 0) {
      // The API stores the menu as one text, with its own limits (length above all).
      const checked = defineMenuSchema.safeParse({ text: menuToText(cleanCourses(menu)) });
      if (!checked.success) {
        found.form = `${checked.error.issues[0]?.message ?? 'The menu cannot be saved'}: shorten some descriptions.`;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { slotId: slot.id, courses: menu },
      {
        onSuccess: () => onDone(`Menu saved for ${time}.`),
        // 422: the slot has started meanwhile, its menu stays as it is.
        onError: (e) =>
          setSaveError(
            apiErrorMessage(e, 'The menu could not be saved. Please try again.', [404, 422]),
          ),
      },
    );
  }

  return (
    <FormDialog onClose={requestClose} labelledBy="menu-editor-title" className="menu-dialog">
      <MenuHeading slot={slot} />
      <form
        className="menu-editor"
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="menu-editor-title"
      >
        <div className="field">
          <label htmlFor="menu-start-from">Start from</label>
          <select
            id="menu-start-from"
            value={startFrom}
            onChange={(e) => {
              const value = e.target.value;
              if (dirty) setConfirming({ kind: 'start', value });
              else startWith(value);
            }}
          >
            {savedCourses && <option value="saved">This slot's menu</option>}
            <option value="empty">Empty menu</option>
            {others.length > 0 && (
              <optgroup label="A previous menu">
                {others.map((m) => (
                  <option key={m.slotId} value={String(m.slotId)}>
                    {menuName(m)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="field__hint">
            {saved && !savedCourses
              ? "This slot's menu is a free text written outside the editor: saving replaces it."
              : 'Pick a previous menu to reuse it, then change what you need.'}
          </p>
        </div>

        {courses.map((course, c) => (
          <fieldset key={course.key} className="menu-course">
            <legend className="visually-hidden">Course {c + 1}</legend>
            <div className="menu-course__head">
              <FormField
                id={`menu-course-${course.key}`}
                label={`Course ${c + 1}`}
                value={course.name}
                error={errors[courseKey(c)]}
                onChange={(e) => updateCourse(course.key, { name: e.target.value })}
              />
              <button
                type="button"
                className="pill pill--remove"
                aria-label={`Remove the course ${course.name || c + 1}`}
                onClick={() => setRemoving({ kind: 'course', course, index: c })}
              >
                Remove
              </button>
            </div>

            {course.dishes.map((dish, d) => {
              const id = `menu-dish-${dish.key}`;
              return (
                <fieldset key={dish.key} className="menu-dish-form">
                  <legend className="field__label">
                    {course.name || 'Course'} · dish {d + 1}
                  </legend>
                  <div className="menu-dish-form__names">
                    <FormField
                      id={`${id}-name`}
                      label="Name (Italian)"
                      lang="it"
                      value={dish.name}
                      error={errors[dishKey(c, d, 'name')]}
                      onChange={(e) => updateDish(course.key, dish.key, { name: e.target.value })}
                    />
                    <FormField
                      id={`${id}-translation`}
                      label="Name (English)"
                      value={dish.translation}
                      error={errors[dishKey(c, d, 'translation')]}
                      onChange={(e) =>
                        updateDish(course.key, dish.key, { translation: e.target.value })
                      }
                    />
                    <FormField
                      id={`${id}-price`}
                      label="Price (€)"
                      inputMode="decimal"
                      value={dish.price}
                      error={errors[dishKey(c, d, 'price')]}
                      onChange={(e) => updateDish(course.key, dish.key, { price: e.target.value })}
                    />
                  </div>

                  <div className="requirements">
                    <p className="field__label menu-dish-form__marks-label" id={`${id}-marks`}>
                      Contains or is
                    </p>
                    <div
                      className="diet-options menu-dish-form__marks"
                      role="group"
                      aria-labelledby={`${id}-marks`}
                    >
                      {MENU_MARKS.map(({ mark, label }) => (
                        <label key={mark} className="diet-option">
                          <input
                            type="checkbox"
                            className="diet-option__input"
                            checked={dish.marks.includes(mark)}
                            onChange={() =>
                              updateDish(course.key, dish.key, { marks: toggle(dish.marks, mark) })
                            }
                          />
                          <MenuMarkIcon mark={mark} className="diet-option__icon" />
                          <span className="diet-option__label">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <MenuTextField
                    id={`${id}-description`}
                    label="Description"
                    value={dish.description}
                    error={errors[dishKey(c, d, 'description')]}
                    onChange={(description) => updateDish(course.key, dish.key, { description })}
                  />

                  <button
                    type="button"
                    className="pill pill--remove"
                    aria-label={`Remove ${dish.name || `dish ${d + 1}`}`}
                    onClick={() => setRemoving({ kind: 'dish', course, dish, index: d })}
                  >
                    Remove dish
                  </button>
                </fieldset>
              );
            })}

            <button
              type="button"
              className="pill pill--outline menu-course__add"
              disabled={course.dishes.length >= MAX_DISHES}
              onClick={() =>
                updateCourse(course.key, { dishes: [...course.dishes, emptyDishDraft()] })
              }
            >
              {course.dishes.length >= MAX_DISHES
                ? `At most ${MAX_DISHES} dishes`
                : `Add a dish to ${course.name || `course ${c + 1}`}`}
            </button>
          </fieldset>
        ))}

        <button
          type="button"
          className="pill pill--outline menu-editor__add-course"
          disabled={courses.length >= MAX_COURSES}
          onClick={() => edit([...courses, { key: nextKey(), name: '', dishes: [] }])}
        >
          {courses.length >= MAX_COURSES ? `At most ${MAX_COURSES} courses` : 'Add a course'}
        </button>

        {errors.form && (
          <p role="alert" className="field-error">
            {errors.form}
          </p>
        )}
        {Object.keys(errors).some((k) => k !== 'form') && (
          <p role="alert" className="field-error">
            Some fields need a fix: see the messages above.
          </p>
        )}
        {saveError && <ErrorNotice message={saveError} />}

        {saved && (
          <button
            type="button"
            className="pill pill--remove menu-editor__delete"
            disabled={busy}
            onClick={() => setConfirming({ kind: 'delete' })}
          >
            Delete menu
          </button>
        )}

        {/* Always in sight at the bottom of the dialog, also while scrolling the dishes. */}
        <div className="menu-editor__footer">
          {confirming?.kind === 'delete' ? (
            <div className="modify-dialog__discard">
              <p className="modify-dialog__discard-title">Delete this menu?</p>
              <p className="field__hint">Hikers will no longer see a menu for {time}.</p>
              <div className="modify-dialog__actions">
                <button
                  ref={keepRef}
                  type="button"
                  className="modify-dialog__secondary"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  Keep menu
                </button>
                <button
                  type="button"
                  className="modify-dialog__danger"
                  disabled={busy}
                  onClick={deleteMenu}
                >
                  {remove.isPending ? 'Deleting menu…' : 'Delete menu'}
                </button>
              </div>
            </div>
          ) : confirming ? (
            <div className="modify-dialog__discard">
              <p className="modify-dialog__discard-title">Discard your changes?</p>
              <div className="modify-dialog__actions">
                <button
                  ref={keepRef}
                  type="button"
                  className="modify-dialog__secondary"
                  onClick={() => setConfirming(null)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="modify-dialog__danger"
                  onClick={() =>
                    confirming.kind === 'close' ? onClose() : startWith(confirming.value)
                  }
                >
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="modify-dialog__actions">
              <button type="button" className="modify-dialog__secondary" onClick={requestClose}>
                Close
              </button>
              <button type="submit" className="modify-dialog__primary" disabled={busy}>
                {save.isPending ? 'Saving menu…' : 'Save menu'}
              </button>
            </div>
          )}
        </div>
      </form>

      {removing?.kind === 'course' && (
        <ConfirmDialog
          title="Remove this course?"
          text={courseRemovalText(removing.course)}
          keepLabel="Keep course"
          confirmLabel="Remove course"
          onKeep={keepRemoving}
          onConfirm={() => {
            setRemoving(null);
            removeCourse(removing.course, removing.index);
          }}
        />
      )}
      {removing?.kind === 'dish' && (
        <ConfirmDialog
          title="Remove this dish?"
          text={`${removing.dish.name.trim() || 'This dish'} will be removed from ${removing.course.name.trim() || 'the course'}.`}
          keepLabel="Keep dish"
          confirmLabel="Remove dish"
          onKeep={keepRemoving}
          onConfirm={() => {
            setRemoving(null);
            removeDish(removing.course.key, removing.dish, removing.index);
          }}
        />
      )}
    </FormDialog>
  );
}

// "Primi and its 2 dishes will be removed from the menu."
function courseRemovalText(course: CourseDraft): string {
  const name = course.name.trim() || 'This course';
  const n = course.dishes.length;
  if (n === 0) return `${name} will be removed from the menu.`;
  return `${name} and its ${n === 1 ? 'dish' : `${n} dishes`} will be removed from the menu.`;
}
