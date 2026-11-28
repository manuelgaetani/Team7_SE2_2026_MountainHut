import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuTextField } from './MenuTextField.tsx';

// MH-10 (R3): the description of a dish, with a toolbar for bold, italic, items and sub-items.

const TEXT = {
  label: 'Description',
  toolbar: 'Format the description',
  bold: 'Bold',
  italic: 'Italic',
  item: 'List item',
  sub: 'Sub-item',
  hint: 'Optional. Ingredients, how it is served.',
} as const;

// The field as the editor uses it: the text lives in the parent.
function Field({ initial = '', error }: { initial?: string; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <MenuTextField id="dish" label={TEXT.label} value={value} onChange={setValue} error={error} />
  );
}

function renderField(initial = '', error?: string) {
  render(<Field initial={initial} error={error} />);
  return screen.getByLabelText<HTMLTextAreaElement>(TEXT.label);
}

// Selects part of the text, then presses a button of the toolbar.
function format(area: HTMLTextAreaElement, tool: string, start: number, end = start) {
  area.setSelectionRange(start, end);
  fireEvent.click(screen.getByRole('button', { name: tool }));
}

describe('MenuTextField (MH-10)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the label, the toolbar, the hint and the character count', () => {
    const area = renderField('Speck');

    expect(screen.getByRole('toolbar', { name: TEXT.toolbar })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText(TEXT.hint)).toBeInTheDocument();
    expect(screen.getByText('5/280')).toBeInTheDocument();
    expect(area).toHaveAttribute('aria-describedby', 'dish-hint');
    expect(area).not.toHaveAttribute('aria-invalid');
  });

  it('counts the characters while typing', () => {
    const area = renderField();
    fireEvent.change(area, { target: { value: 'Polenta' } });

    expect(area).toHaveValue('Polenta');
    expect(screen.getByText('7/280')).toBeInTheDocument();
  });

  it('shows an error next to the field', () => {
    const area = renderField('', 'A description can be at most 280 characters.');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A description can be at most 280 characters.',
    );
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveAttribute('aria-describedby', 'dish-hint dish-error');
  });

  it('keeps the selection of the text area while a button is pressed', () => {
    renderField();
    const pressed = fireEvent.mouseDown(screen.getByRole('button', { name: TEXT.bold }));

    // fireEvent returns false when the default action was prevented.
    expect(pressed).toBe(false);
  });

  describe('bold and italic', () => {
    it('puts the selection in bold', () => {
      const area = renderField('with speck');
      format(area, TEXT.bold, 5, 10);

      expect(area).toHaveValue('with **speck**');
    });

    it('writes a placeholder in bold when nothing is selected, and selects it', async () => {
      const area = renderField('');
      format(area, TEXT.bold, 0);

      expect(area).toHaveValue('**bold text**');
      await waitFor(() => {
        expect(area.selectionStart).toBe(2);
        expect(area.selectionEnd).toBe(11);
      });
      expect(area).toHaveFocus();
    });

    it('puts the selection in italic', () => {
      const area = renderField('soft polenta');
      format(area, TEXT.italic, 0, 4);

      expect(area).toHaveValue('*soft* polenta');
    });

    it('writes a placeholder in italic when nothing is selected', () => {
      const area = renderField('Polenta ');
      format(area, TEXT.italic, 8);

      expect(area).toHaveValue('Polenta *italic text*');
    });
  });

  describe('list items and sub-items', () => {
    it('makes the line of the cursor an item', () => {
      const area = renderField('bread');
      format(area, TEXT.item, 2);

      expect(area).toHaveValue('- bread');
    });

    it('makes every selected line an item, and removes the items when pressed again', () => {
      const area = renderField('bread\nspeck');
      format(area, TEXT.item, 0, 11);
      expect(area).toHaveValue('- bread\n- speck');

      format(area, TEXT.item, 0, 15);
      expect(area).toHaveValue('bread\nspeck');
    });

    it('changes an item into a sub-item, and back', () => {
      const area = renderField('- bread\n- rye');
      format(area, TEXT.sub, 10);
      expect(area).toHaveValue('- bread\n  - rye');

      format(area, TEXT.item, 12);
      expect(area).toHaveValue('- bread\n- rye');
    });

    it('removes a sub-item when pressed on a sub-item', () => {
      const area = renderField('- bread\n  - rye');
      format(area, TEXT.sub, 12);

      expect(area).toHaveValue('- bread\nrye');
    });

    it('does not touch the line after a selection that ends with a new line', () => {
      const area = renderField('bread\nspeck');
      format(area, TEXT.item, 0, 6);

      expect(area).toHaveValue('- bread\nspeck');
    });

    it('works on a line in the middle of the text', () => {
      const area = renderField('Served with:\nbread\ncheese');
      format(area, TEXT.item, 15);

      expect(area).toHaveValue('Served with:\n- bread\ncheese');
    });
  });
});
