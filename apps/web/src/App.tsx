import { Navigate, Outlet, useLocation } from 'react-router';
import { useCurrentUser } from './api/useAuth.ts';
import { NavBar } from './components/NavBar.tsx';

const CHANGE_PASSWORD_PATH = '/change-password';

export function App() {
  const { data: user } = useCurrentUser();
  const { pathname } = useLocation();
  // MH-07: an account created by the staff must replace the generated password before anything else.
  const mustChange = user?.mustChangePassword === true && pathname !== CHANGE_PASSWORD_PATH;

  return (
    <>
      <header className="site-header">
        <NavBar />
      </header>
      <main>{mustChange ? <Navigate to={CHANGE_PASSWORD_PATH} replace /> : <Outlet />}</main>
    </>
  );
}
