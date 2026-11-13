import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS } from '@mountain-hut/shared';
import { RequirementsEditor } from './RequirementsEditor.tsx';
import type { RequirementDraft } from './RequirementsEditor.tsx';

const TEXT = {
  addFirst: 'Add a requirement',
  addAnother: 'Add another requirement',
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

describe('RequirementsEditor', () => {
  it('starts with no entries and an add button', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.addFirst })).toBeEnabled();
  });

  it('adds an entry and renames the add button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: TEXT.addFirst }));
    expect(screen.getByRole('textbox', { name: 'Requirement 1' })).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Allergies, requirement 1' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeInTheDocument();
  });

  it('edits the description and the allergies flag of one entry only', () => {
    render(<Harness initial={[row(1), row(2)]} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Requirement 2' }), {
      target: { value: '1 shellfish allergy' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allergies, requirement 2' }));
    expect(screen.getByRole('textbox', { name: 'Requirement 1' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Requirement 2' })).toHaveValue(
      '1 shellfish allergy',
    );
    expect(screen.getByRole('checkbox', { name: 'Allergies, requirement 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Allergies, requirement 2' })).toBeChecked();
  });

  it('removes the chosen entry and keeps the others', () => {
    render(<Harness initial={[row(1, 'vegan'), row(2, 'vegetarian')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove requirement 1' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('vegetarian');
  });

  it('does not reuse the key of a removed entry', () => {
    render(<Harness initial={[row(1, 'a'), row(2, 'b')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove requirement 2' }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.addAnother }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('disables the add button at the maximum number of entries', () => {
    const rows = Array.from({ length: MAX_REQUIREMENTS }, (_, i) => row(i + 1, 'x'));
    render(<Harness initial={rows} />);
    expect(screen.getByRole('button', { name: TEXT.addAnother })).toBeDisabled();
  });
});
