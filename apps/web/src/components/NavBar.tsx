import { Link } from 'react-router';
import { useCurrentUser, useLogout } from '../api/useAuth.ts';

export function NavBar() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();

  let account = null;
  if (!isPending) {
    account = user ? (
      <>
        <span>{user.email}</span>
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </button>
      </>
    ) : (
      <>
        <Link to="/login">Sign in</Link>
        <Link to="/register">Register</Link>
      </>
    );
  }

  return (
    <nav>
      <Link to="/">
        <strong>Mountain Hut</strong>
      </Link>
      {account}
    </nav>
  );
}