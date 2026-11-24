import { Link, useLocation } from 'react-router';
import { SESSION_EXPIRED } from '../lib/errors.ts';

// The text of an error. When the session has expired it links to sign in and back here.
export function ErrorMessage({ message }: { message: string }) {
  const { pathname, search } = useLocation();
  if (message !== SESSION_EXPIRED) return <>{message}</>;
  return (
    <>
      The session has expired. Please{' '}
      <Link to={`/login?next=${encodeURIComponent(pathname + search)}`}>sign in</Link> again.
    </>
  );
}

interface ErrorNoticeProps {
  message: string;
  className?: string;
}

// An error alert.
export function ErrorNotice({ message, className }: ErrorNoticeProps) {
  const classes = className ? `notice notice--error ${className}` : 'notice notice--error';
  return (
    <p role="alert" className={classes}>
      <ErrorMessage message={message} />
    </p>
  );
}
