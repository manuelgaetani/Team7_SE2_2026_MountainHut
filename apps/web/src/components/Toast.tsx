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

type ToastInput = { kind?: ToastKind; message: string };
type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastApi = { show: (t: ToastInput) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}

function ToastView({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const { id } = toast;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onClose(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, id, onClose]);

  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        onClick={() => onClose(id)}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const close = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(({ kind = 'ok', message }: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((list) => [...list, { id, kind, message }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onClose={close} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
