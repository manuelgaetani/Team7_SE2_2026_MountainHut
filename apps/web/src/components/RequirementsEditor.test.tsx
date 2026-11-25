import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DIETARY_OPTIONS, MAX_REQUIREMENTS_COUNT, type DietaryCode } from '@mountain-hut/shared';
import { RequirementsEditor } from './RequirementsEditor.tsx';
import { ToastProvider } from './Toast.tsx';
import type { RequirementDraft } from '../lib/requirements.ts';

const TEXT = {
  addFirst: 'Add a requirement',
  addAnother: 'Add another requirement',
  other: 'Other',
  otherNeed: 'Other need',
  allergy: 'Allergy or intolerance',
  remove: 'Remove',
  glutenFree: 'Gluten-free',
  lactoseFree: 'Lactose-free',
  vegan: 'Vegan',
  hint: 'Add one entry for each person or group with the same needs. Pick the needs from the list, or choose Other for one that is not there.',
  row: (n: number) => `Requirement ${n}`,
} as const;

function Harness({
  initial = [],
  errors,
  onRows,
}: {
  initial?: RequirementDraft[];
  errors?: Partial<Record<number, string>>;
  onRows?: (rows: RequirementDraft[]) => void;
}) {
  const [rows, setRows] = useState<RequirementDraft[]>(initial);
  return (
    <ToastProvider>
      <RequirementsEditor
        value={rows}
        onChange={(next) => {
          setRows(next);
          onRows?.(next);
        }}
        errors={errors}
      />
    </ToastProvider>
  );
}

const row = (
  key: number,
  description = '',
  allergies = false,
  restrictions: DietaryCode[] = [],
): RequirementDraft => ({
  key,
  restrictions,
  other: description !== '',
  allergies,
  description,
});

// Each entry is a group named "Requirement n": the controls are looked up inside it.
const group = (n: number) => within(screen.getByRole('group', { name: TEXT.row(n) }));

describe('RequirementsEditor', () => {
  it('starts with no entries and an add button', () => {
    render(<Harness />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.addFirst })).toBeEnabled();
  });

  it('adds an entry with every need of the hut, each named under its icon, plus Other', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: TEXT.addFirst }));
    for (const option of DIETARY_OPTIONS) {
      expect(group(1).getByRole('checkbox', { name: option.label })).not.toBeChecked();
    }
    expect(group(1).getByRole('checkbox', { name: TEXT.other })).not.toBeChecked();
    // The free text appears only with Other.
    expect(group(1).queryByRole('textbox')).not.toBeInTheDocument();
    expect(group(1).getByRole('button', { name: TEXT.remove })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeInTheDocument();
  });

  it('picks several needs and unpicks one', () => {
    let last: RequirementDraft[] = [];
    render(<Harness initial={[row(1)]} onRows={(r) => (last = r)} />);
    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.glutenFree }));
    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.vegan }));
    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.lactoseFree }));
    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.vegan }));
    expect(group(1).getByRole('checkbox', { name: TEXT.glutenFree })).toBeChecked();
    expect(group(1).getByRole('checkbox', { name: TEXT.vegan })).not.toBeChecked();
    expect(last[0].restrictions).toEqual(['GLUTEN_FREE', 'LACTOSE_FREE']);
  });

  it('opens a focused text field with Other, together with the picked needs', () => {
    render(<Harness initial={[row(1, '', false, ['EGG_FREE'])]} />);
    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.other }));
    const input = group(1).getByRole('textbox', { name: TEXT.otherNeed });
    expect(input).toHaveFocus();
    expect(group(1).getByRole('checkbox', { name: TEXT.allergy })).not.toBeChecked();
    expect(group(1).getByRole('checkbox', { name: 'Egg-free' })).toBeChecked();

    fireEvent.click(group(1).getByRole('checkbox', { name: TEXT.other }));
    expect(group(1).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not steal the focus for an entry that already has a free text', () => {
    render(<Harness initial={[row(1, 'shellfish', true)]} />);
    expect(group(1).getByRole('textbox', { name: TEXT.otherNeed })).not.toHaveFocus();
  });

  it('edits the free text and the allergy flag of one entry only', () => {
    render(<Harness initial={[row(1, 'a'), row(2, 'b')]} />);
    fireEvent.change(group(2).getByRole('textbox', { name: TEXT.otherNeed }), {
      target: { value: 'shellfish' },
    });
    fireEvent.click(group(2).getByRole('checkbox', { name: TEXT.allergy }));
    expect(group(1).getByRole('textbox', { name: TEXT.otherNeed })).toHaveValue('a');
    expect(group(2).getByRole('textbox', { name: TEXT.otherNeed })).toHaveValue('shellfish');
    expect(group(1).getByRole('checkbox', { name: TEXT.allergy })).not.toBeChecked();
    expect(group(2).getByRole('checkbox', { name: TEXT.allergy })).toBeChecked();
  });

  it('removes the chosen entry and keeps the others', () => {
    render(<Harness initial={[row(1, 'vegetarian'), row(2, '', false, ['VEGAN'])]} />);
    fireEvent.click(group(1).getByRole('button', { name: TEXT.remove }));
    expect(screen.getAllByTestId('requirement-row')).toHaveLength(1);
    expect(group(1).getByRole('checkbox', { name: TEXT.vegan })).toBeChecked();
  });

  it('offers to undo a removal, and puts the entry back in its place', () => {
    render(<Harness initial={[row(1, '', false, ['NUT_FREE']), row(2, 'vegetarian')]} />);
    fireEvent.click(group(1).getByRole('button', { name: TEXT.remove }));
    // A listed allergen makes it an allergy requirement.
    expect(screen.getByRole('status')).toHaveTextContent('Allergy requirement removed.');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(group(1).getByRole('checkbox', { name: 'Nut-free' })).toBeChecked();
    expect(group(2).getByRole('textbox', { name: TEXT.otherNeed })).toHaveValue('vegetarian');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('says "Requirement removed." for an entry without allergies', () => {
    render(<Harness initial={[row(1, '', false, ['VEGAN'])]} />);
    fireEvent.click(group(1).getByRole('button', { name: TEXT.remove }));
    expect(screen.getByRole('status')).toHaveTextContent('Requirement removed.');
  });

  it('does not reuse the key of a removed entry', () => {
    render(<Harness initial={[row(1, 'a'), row(2, 'b')]} />);
    fireEvent.click(group(2).getByRole('button', { name: TEXT.remove }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.addAnother }));
    expect(screen.getAllByTestId('requirement-row')).toHaveLength(2);
  });

  it('does not cut long descriptions: the length is checked on submit', () => {
    render(<Harness initial={[row(1, 'x')]} />);
    expect(group(1).getByRole('textbox', { name: TEXT.otherNeed })).not.toHaveAttribute(
      'maxlength',
    );
  });

  it('disables the add button at the maximum number of entries', () => {
    const rows = Array.from({ length: MAX_REQUIREMENTS_COUNT }, (_, i) => row(i + 1, 'x'));
    render(<Harness initial={rows} />);
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeDisabled();
  });

  it('shows a row error and marks only that input invalid', () => {
    render(
      <Harness initial={[row(1, 'a'), row(2, ' ')]} errors={{ 2: 'Describe the other need.' }} />,
    );
    expect(group(2).getByRole('alert')).toHaveTextContent('Describe the other need.');
    expect(group(2).getByRole('textbox', { name: TEXT.otherNeed })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(group(1).queryByRole('alert')).not.toBeInTheDocument();
    expect(group(1).getByRole('textbox', { name: TEXT.otherNeed })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('shows a row error for an entry with nothing picked', () => {
    render(<Harness initial={[row(1)]} errors={{ 1: 'Choose at least one need.' }} />);
    expect(screen.getByRole('group', { name: TEXT.row(1) })).toHaveAccessibleDescription(
      'Choose at least one need.',
    );
  });

  it('shows a single hint', () => {
    render(<Harness initial={[row(1)]} />);
    expect(screen.getByText(TEXT.hint)).toBeInTheDocument();
  });
});
