import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotSheet } from './SlotSheet.tsx';

// On narrow screens the side panel of Time slots is a dialog opened from a bar at the bottom.

const TEXT = {
  open: 'Create slots',
  close: 'Close',
  title: 'New time slot',
} as const;

function renderSheet(open: boolean) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const sheet = (isOpen: boolean) => (
    <SlotSheet open={isOpen} onOpen={onOpen} onClose={onClose} labelledBy="sheet-title">
      <h2 id="sheet-title">{TEXT.title}</h2>
      <input aria-label="Start time" />
    </SlotSheet>
  );
  const view = render(sheet(open));
  return { onOpen, onClose, rerender: (isOpen: boolean) => view.rerender(sheet(isOpen)) };
}

describe('SlotSheet', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows only the bar while closed, and opens from it', () => {
    const { onOpen, onClose } = renderSheet(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The form stays mounted while the dialog is closed.
    expect(screen.getByLabelText('Start time', { selector: 'input' })).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: TEXT.open }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Escape does nothing while closed.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the dialog named by its heading, with the focus in it', () => {
    renderSheet(true);

    const dialog = screen.getByRole('dialog', { name: TEXT.title });
    expect(dialog).toHaveFocus();
    expect(dialog.parentElement).toHaveClass('dialog-backdrop');
  });

  it('closes with Escape, the × button and the backdrop, not with a click inside', () => {
    const { onClose } = renderSheet(true);
    const dialog = screen.getByRole('dialog', { name: TEXT.title });

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: TEXT.close }));
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('gives the focus back to the bar button once closed', () => {
    const { rerender } = renderSheet(true);
    rerender(false);

    expect(screen.getByRole('button', { name: TEXT.open })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
