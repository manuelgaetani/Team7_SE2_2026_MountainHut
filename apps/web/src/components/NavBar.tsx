import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser, useLogout } from '../api/useAuth.ts';
import { useToast } from './Toast.tsx';

export function NavBar() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const toast = useToast();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // The auth pages already have their own Sign in / Register tabs.
  const onAuthPage = pathname === '/login' || pathname === '/register';

  let links = null;
  if (!isPending) {
    if (user) {
      links = (
        <>
          {isStaff(user) ? (
            <>
              <NavLink to="/staff/slots" className="pill">
                Time slots
              </NavLink>
              <NavLink to="/staff/bookings/new" className="pill">
                New booking
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/book" className="pill">
                Book a table
              </NavLink>
              <NavLink to="/availability" className="pill">
                Availability
              </NavLink>
              <NavLink to="/bookings" className="pill">
                My bookings
              </NavLink>
            </>
          )}
          <NavLink to="/change-password" className="pill">
            Change password
          </NavLink>
          <button
            type="button"
            className="pill"
            onClick={() => {
              // Go home first, then sign out: the page left behind never sees the user
              // disappear, so it cannot send them somewhere else (e.g. /unauthorized).
              void navigate('/', { replace: true });
              logout.mutate(undefined, {
                onSuccess: () => toast.show({ message: 'Signed out.' }),
              });
            }}
            disabled={logout.isPending}
          >
            Sign out
          </button>
        </>
      );
    } else {
      links = (
        <>
          <NavLink to="/availability" className="pill">
            Availability
          </NavLink>
          {!onAuthPage && (
            <>
              <NavLink to="/login" className="pill">
                Sign in
              </NavLink>
              <NavLink to="/register" className="pill">
                Register
              </NavLink>
            </>
          )}
        </>
      );
    }
  }

  return (
    <nav className="nav">
      <Link to="/" className="brand">
        Mountain Hut
      </Link>
      <div className="nav-actions">{links}</div>
    </nav>
  );
}
