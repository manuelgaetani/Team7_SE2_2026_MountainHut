import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useCurrentUser, useLogout } from '../api/useAuth.ts';

export function NavBar() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // The auth pages already have their own Sign in / Register tabs.
  const onAuthPage = pathname === '/login' || pathname === '/register';

  let account = null;
  if (!isPending) {
    if (user) {
      account = (
        <>
          {user.role === 'HIKER' && (
            <NavLink to="/bookings" className="pill">
              Personal area
            </NavLink>
          )}
          <button
            type="button"
            className="pill"
            onClick={() =>
              // After signing out the user goes back to the home page,
              // so no page meant for a signed-in user stays on screen.
              logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })
            }
            disabled={logout.isPending}
          >
            Sign out
          </button>
        </>
      );
    } else if (!onAuthPage) {
      account = (
        <>
          <Link to="/login" className="nav-link">
            Sign in
          </Link>
          <Link to="/register" className="pill">
            Register
          </Link>
        </>
      );
    }
  }

  return (
    <nav className="nav">
      <Link to="/" className="brand">
        Mountain Hut
      </Link>
      <div className="nav-actions">{account}</div>
    </nav>
  );
}
