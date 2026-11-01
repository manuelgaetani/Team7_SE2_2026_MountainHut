import { Link, useLocation } from 'react-router';
import { useCurrentUser, useLogout } from '../api/useAuth.ts';

export function NavBar() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();
  const { pathname } = useLocation();
  // The auth pages already have their own Sign in / Register tabs.
  const onAuthPage = pathname === '/login' || pathname === '/register';

  let account = null;
  if (!isPending) {
    if (user) {
      account = (
        <>
          <span className="nav-user">{user.email}</span>
          <button
            type="button"
            className="pill"
            onClick={() => logout.mutate()}
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
