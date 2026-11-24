import { Link, useLocation } from 'react-router';
import { SESSION_EXPIRED } from '../lib/errors.ts';

interface ErrorNoticeProps {
  message: string;
  className?: string;
}

// An error alert. When the session has expired the notice links to sign in and back here.
export function ErrorNotice({ message, className }: ErrorNoticeProps) {
  const { pathname, search } = useLocation();
  const classes = className ? `notice notice--error ${className}` : 'notice notice--error';
  return (
    <p role="alert" className={classes}>
      {message === SESSION_EXPIRED ? (
        <>
          The session has expired. Please{' '}
          <Link to={`/login?next=${encodeURIComponent(pathname + search)}`}>sign in</Link> again.
        </>
      ) : (
        message
      )}
    </p>
  );
}
