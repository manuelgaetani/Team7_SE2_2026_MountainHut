import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS_COUNT } from '@mountain-hut/shared';
import { RequirementsEditor } from './RequirementsEditor.tsx';
import { ToastProvider } from './Toast.tsx';
import type { RequirementDraft } from './RequirementsEditor.tsx';

const TEXT = {
  addFirst: 'Add a requirement',
  addAnother: 'Add another requirement',
  details: 'Details',
  allergies: 'Allergies',
  remove: 'Remove',
  row: (n: number) => `Requirement ${n}`,
} as const;

function Harness({
  initial = [],
  errors,
}: {
  initial?: RequirementDraft[];
  errors?: Partial<Record<number, string>>;
}) {
  const [rows, setRows] = useState<RequirementDraft[]>(initial);
  return (
    <ToastProvider>
      <RequirementsEditor value={rows} onChange={setRows} errors={errors} />
    </ToastProvider>
  );
}

const row = (key: number, description = '', allergies = false): RequirementDraft => ({
  key,
  allergies,
  description,
});

// Each entry is a group named "Requirement n": the controls are looked up inside it.
const group = (n: number) => within(screen.getByRole('group', { name: TEXT.row(n) }));

describe('RequirementsEditor', () => {
  it('starts with no entries and an add button', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.addFirst })).toBeEnabled();
  });

  it('adds an entry and renames the add button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: TEXT.addFirst }));
    expect(group(1).getByRole('textbox', { name: TEXT.details })).toHaveValue('');
    expect(group(1).getByRole('checkbox', { name: TEXT.allergies })).not.toBeChecked();
    expect(group(1).getByRole('button', { name: TEXT.remove })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeInTheDocument();
  });

  it('edits the description and the allergies flag of one entry only', () => {
    render(<Harness initial={[row(1), row(2)]} />);
    fireEvent.change(group(2).getByRole('textbox', { name: TEXT.details }), {
      target: { value: '1 shellfish allergy' },
    });
    fireEvent.click(group(2).getByRole('checkbox', { name: TEXT.allergies }));
    expect(group(1).getByRole('textbox', { name: TEXT.details })).toHaveValue('');
    expect(group(2).getByRole('textbox', { name: TEXT.details })).toHaveValue(
      '1 shellfish allergy',
    );
    expect(group(1).getByRole('checkbox', { name: TEXT.allergies })).not.toBeChecked();
    expect(group(2).getByRole('checkbox', { name: TEXT.allergies })).toBeChecked();
  });

  it('removes the chosen entry and keeps the others', () => {
    render(<Harness initial={[row(1, 'vegan'), row(2, 'vegetarian')]} />);
    fireEvent.click(group(1).getByRole('button', { name: TEXT.remove }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('vegetarian');
  });

  it('offers to undo a removal, and puts the entry back in its place', () => {
    render(<Harness initial={[row(1, 'vegan', true), row(2, 'vegetarian')]} />);
    fireEvent.click(group(1).getByRole('button', { name: TEXT.remove }));
    expect(screen.getByRole('status')).toHaveTextContent('Allergy requirement removed.');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('textbox').map((t) => (t as HTMLInputElement).value)).toEqual([
      'vegan',
      'vegetarian',
    ]);
    expect(group(1).getByRole('checkbox', { name: TEXT.allergies })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('does not reuse the key of a removed entry', () => {
    render(<Harness initial={[row(1, 'a'), row(2, 'b')]} />);
    fireEvent.click(group(2).getByRole('button', { name: TEXT.remove }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.addAnother }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('does not cut long descriptions: the length is checked on submit', () => {
    render(<Harness initial={[row(1)]} />);
    expect(group(1).getByRole('textbox', { name: TEXT.details })).not.toHaveAttribute('maxlength');
  });

  it('disables the add button at the maximum number of entries', () => {
    const rows = Array.from({ length: MAX_REQUIREMENTS_COUNT }, (_, i) => row(i + 1, 'x'));
    render(<Harness initial={rows} />);
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeDisabled();
  });

  it('shows a row error and marks only that input invalid', () => {
    render(<Harness initial={[row(1), row(2)]} errors={{ 2: 'Describe this requirement.' }} />);
    expect(group(2).getByRole('alert')).toHaveTextContent('Describe this requirement.');
    expect(group(2).getByRole('textbox', { name: TEXT.details })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(group(1).queryByRole('alert')).not.toBeInTheDocument();
    expect(group(1).getByRole('textbox', { name: TEXT.details })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('shows a single hint', () => {
    render(<Harness initial={[row(1)]} />);
    expect(
      screen.getByText('Add one entry for each person or group with the same needs.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/say how many people/)).not.toBeInTheDocument();
  });
});
