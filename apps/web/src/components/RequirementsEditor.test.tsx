import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS_COUNT } from '@mountain-hut/shared';
import { RequirementsEditor } from './RequirementsEditor.tsx';
import type { RequirementDraft } from './RequirementsEditor.tsx';

const TEXT = {
  addFirst: 'Add a requirement',
  addAnother: 'Add another requirement',
  details: 'Details',
  allergies: 'Allergies',
  remove: 'Remove',
  row: (n: number) => `Requirement ${n}`,
} as const;

function Harness({ initial = [] }: { initial?: RequirementDraft[] }) {
  const [rows, setRows] = useState<RequirementDraft[]>(initial);
  return <RequirementsEditor value={rows} onChange={setRows} />;
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
});
