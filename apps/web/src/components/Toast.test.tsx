import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_TOAST_MS, TOAST_MS, ToastProvider, useToast } from './Toast.tsx';

const TEXT = {
  ok: 'Slot created.',
  error: 'Something went wrong.',
  second: 'Second message.',
  dismiss: 'Dismiss notification',
  showOk: 'show ok',
  showError: 'show error',
  showSecond: 'show second',
  showAndUnmount: 'show and unmount',
} as const;

function Trigger() {
  const { show } = useToast();
  return (
    <>
      <button type="button" onClick={() => show({ message: TEXT.ok })}>
        {TEXT.showOk}
      </button>
      <button type="button" onClick={() => show({ kind: 'error', message: TEXT.error })}>
        {TEXT.showError}
      </button>
      <button type="button" onClick={() => show({ message: TEXT.second })}>
        {TEXT.showSecond}
      </button>
    </>
  );
}

function Unmounting() {
  const { show } = useToast();
  const [mounted, setMounted] = useState(true);
  if (!mounted) return null;
  return (
    <button
      type="button"
      onClick={() => {
        show({ message: TEXT.ok });
        setMounted(false);
      }}
    >
      {TEXT.showAndUnmount}
    </button>
  );
}

function WithUndo({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        show({ message: TEXT.ok, action: { label: 'Undo', onClick: onUndo }, onExpire })
      }
    >
      {TEXT.showOk}
    </button>
  );
}

function renderToasts(child = <Trigger />) {
  return render(<ToastProvider>{child}</ToastProvider>);
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a success toast with role status', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    expect(screen.getByRole('status')).toHaveTextContent(TEXT.ok);
  });

  it('shows an error toast with role alert', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showError }));
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.error);
  });

  it('keeps the close button out of the status text', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    expect(screen.getByRole('status')).toHaveTextContent(/^Slot created\.$/);
    fireEvent.click(screen.getByRole('button', { name: TEXT.showError }));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Something went wrong\.$/);
  });

  it('hides the toast after 5 seconds', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.queryByText(TEXT.ok)).not.toBeInTheDocument();
  });

  it('keeps the toast while hovered', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByText(TEXT.ok)).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.queryByText(TEXT.ok)).not.toBeInTheDocument();
  });

  it('closes on the close button', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.dismiss }));
    expect(screen.queryByText(TEXT.ok)).not.toBeInTheDocument();
  });

  it('stacks two toasts', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.showSecond }));
    expect(screen.getByText(TEXT.ok)).toBeInTheDocument();
    expect(screen.getByText(TEXT.second)).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('stays visible after the component that showed it unmounts', () => {
    renderToasts(<Unmounting />);
    fireEvent.click(screen.getByRole('button', { name: TEXT.showAndUnmount }));
    expect(screen.queryByRole('button', { name: TEXT.showAndUnmount })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(TEXT.ok);
  });

  describe('with an Undo action', () => {
    function renderUndo() {
      const onUndo = vi.fn();
      const onExpire = vi.fn();
      renderToasts(<WithUndo onUndo={onUndo} onExpire={onExpire} />);
      fireEvent.click(screen.getByRole('button', { name: TEXT.showOk }));
      return { onUndo, onExpire };
    }

    it('runs the action, closes and never expires', () => {
      const { onUndo, onExpire } = renderUndo();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      act(() => {
        vi.advanceTimersByTime(ACTION_TOAST_MS);
      });
      expect(onUndo).toHaveBeenCalledOnce();
      expect(onExpire).not.toHaveBeenCalled();
      expect(screen.queryByText(TEXT.ok)).not.toBeInTheDocument();
    });

    it('stays longer than a plain toast, then expires once', () => {
      const { onUndo, onExpire } = renderUndo();
      act(() => {
        vi.advanceTimersByTime(TOAST_MS);
      });
      expect(screen.getByText(TEXT.ok)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(ACTION_TOAST_MS - TOAST_MS);
      });
      expect(screen.queryByText(TEXT.ok)).not.toBeInTheDocument();
      expect(onExpire).toHaveBeenCalledOnce();
      expect(onUndo).not.toHaveBeenCalled();
    });

    it('expires on the close button', () => {
      const { onExpire } = renderUndo();
      fireEvent.click(screen.getByRole('button', { name: TEXT.dismiss }));
      expect(onExpire).toHaveBeenCalledOnce();
    });

    it('expires when the page is left', () => {
      const { onExpire } = renderUndo();
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(onExpire).toHaveBeenCalledOnce();
    });
  });

  it('throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow();
    spy.mockRestore();
  });
});
