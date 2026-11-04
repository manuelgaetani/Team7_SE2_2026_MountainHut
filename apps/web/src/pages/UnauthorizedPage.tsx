import { Link } from 'react-router';
import { useCurrentUser } from '../api/useAuth.ts';

export function UnauthorizedPage() {
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  return (
    <section className="landing-status">
      <div className="landing-status__card">
        <p className="eyebrow">403 · Restricted area</p>
        <h1 className="landing-status__title">Access restricted</h1>
        <p className="landing-status__text">
          {!isPending && user
            ? `You are signed in as ${user.email}, but your account does not have permission to access this section of the mountain hut.`
            : 'You must be signed in with an authorized staff account to access this section of the hut.'}
        </p>

        <div className="landing-status__actions">
          {!isPending && !user ? (
            <>
              <Link to="/login" className="button-primary button-primary--inline">
                <span>Sign in</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link to="/" className="pill">
                Back to home
              </Link>
            </>
          ) : (
            <>
              <Link to="/" className="button-primary button-primary--inline">
                <span>Back to home</span>
                <span aria-hidden="true">→</span>
              </Link>
              {isStaff ? (
                <Link to="/staff/slots" className="pill">
                  Manage slots
                </Link>
              ) : (
                <Link to="/book" className="pill">
                  Book a table
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

