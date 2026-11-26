import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

export type ToastKind = 'ok' | 'error';

export const TOAST_MS = 5000;
// A toast with an action (e.g. Undo) stays longer, so there is time to press it.
export const ACTION_TOAST_MS = 8000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  kind?: ToastKind;
  message: string;
  /** A button in the toast, e.g. Undo. Pressing it closes the toast without calling onExpire. */
  action?: ToastAction;
  /** Called when the toast goes away for any other reason: timeout, × button, dismiss, page left. */
  onExpire?: () => void;
}

type ToastItem = { id: number; kind: ToastKind; message: string; actionLabel?: string };
type ToastApi = {
  /** Shows a toast and returns its id. */
  show: (t: ToastInput) => number;
  /** Closes a toast as if it had timed out. */
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}

interface ToastViewProps {
  toast: ToastItem;
  onClose: (id: number) => void;
  onAction: (id: number) => void;
}

function ToastView({ toast, onClose, onAction }: ToastViewProps) {
  const [paused, setPaused] = useState(false);
  const { id, actionLabel } = toast;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onClose(id), actionLabel ? ACTION_TOAST_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, id, actionLabel, onClose]);

  return (
    <div
      className={`toast toast--${toast.kind}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast__icon" aria-hidden="true">
        {toast.kind === 'error' ? '!' : '✓'}
      </span>
      <span className="toast__message" role={toast.kind === 'error' ? 'alert' : 'status'}>
        {toast.message}
      </span>
      {actionLabel && (
        <button type="button" className="toast__action" onClick={() => onAction(id)}>
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        onClick={() => onClose(id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

type Callbacks = { action?: ToastAction; onExpire?: () => void };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // Kept out of the state: they run once, when the toast goes away.
  const callbacks = useRef(new Map<number, Callbacks>());

  const remove = useCallback((id: number): Callbacks | undefined => {
    const found = callbacks.current.get(id);
    callbacks.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
    return found;
  }, []);

  const close = useCallback((id: number) => remove(id)?.onExpire?.(), [remove]);

  const act = useCallback((id: number) => remove(id)?.action?.onClick(), [remove]);

  const show = useCallback(({ kind = 'ok', message, action, onExpire }: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    callbacks.current.set(id, { action, onExpire });
    setToasts((list) => [...list, { id, kind, message, actionLabel: action?.label }]);
    return id;
  }, []);

  // Leaving the page settles what is waiting for its toast (e.g. a cancellation not undone).
  useEffect(() => {
    const flush = () => {
      for (const id of [...callbacks.current.keys()]) close(id);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [close]);

  const api = useMemo(() => ({ show, dismiss: close }), [show, close]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onClose={close} onAction={act} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
