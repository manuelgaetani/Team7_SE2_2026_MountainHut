import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.tsx';

const TEXT = {
  title: 'Remove this dish?',
  text: 'Polenta will be removed from Primi.',
  keep: 'Keep dish',
  confirm: 'Remove dish',
  open: 'Remove',
  close: 'Close',
} as const;

// A page with a button that opens the question, like the Remove buttons of the menu editor.
function Page({ onConfirm, onPageKey }: { onConfirm: () => void; onPageKey?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div onKeyDown={onPageKey}>
      <button type="button" onClick={() => setOpen(true)}>
        {TEXT.open}
      </button>
      {open && (
        <ConfirmDialog
          title={TEXT.title}
          text={TEXT.text}
          keepLabel={TEXT.keep}
          confirmLabel={TEXT.confirm}
          onKeep={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        />
      )}
    </div>
  );
}

const openQuestion = () => fireEvent.click(screen.getByRole('button', { name: TEXT.open }));

describe('ConfirmDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the question with the safe answer focused', () => {
    render(<Page onConfirm={vi.fn()} />);
    openQuestion();
    const dialog = screen.getByRole('alertdialog', { name: TEXT.title });
    expect(dialog).toHaveAccessibleDescription(TEXT.text);
    expect(screen.getByRole('button', { name: TEXT.keep })).toHaveFocus();
  });

  it('runs the action only on the destructive answer', () => {
    const onConfirm = vi.fn();
    render(<Page onConfirm={onConfirm} />);
    openQuestion();
    fireEvent.click(screen.getByRole('button', { name: TEXT.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([
    ['the safe answer', () => fireEvent.click(screen.getByRole('button', { name: TEXT.keep }))],
    ['the ×', () => fireEvent.click(screen.getByRole('button', { name: TEXT.close }))],
    [
      'a click on the backdrop',
      () => fireEvent.click(screen.getByRole('alertdialog').parentElement as HTMLElement),
    ],
    ['Escape', () => fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })],
  ])('keeps everything as it is with %s', (_name, answer) => {
    const onConfirm = vi.fn();
    render(<Page onConfirm={onConfirm} />);
    openQuestion();
    answer();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps Escape away from the dialog or page below', () => {
    const onPageKey = vi.fn();
    const onDocumentKey = vi.fn();
    document.addEventListener('keydown', onDocumentKey);
    render(<Page onConfirm={vi.fn()} onPageKey={onPageKey} />);
    openQuestion();
    fireEvent.keyDown(screen.getByRole('button', { name: TEXT.keep }), { key: 'Escape' });
    document.removeEventListener('keydown', onDocumentKey);
    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(onPageKey).not.toHaveBeenCalled();
  });

  it('makes the rest of the page unusable while it is open, and gives the focus back', () => {
    const { container } = render(<Page onConfirm={vi.fn()} />);
    const opener = screen.getByRole('button', { name: TEXT.open });
    opener.focus();
    openQuestion();
    expect(container.inert).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: TEXT.keep }));
    expect(container.inert).toBe(false);
    expect(opener).toHaveFocus();
  });
});
