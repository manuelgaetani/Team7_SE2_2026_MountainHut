import { NavLink, useSearchParams } from 'react-router';
import { authPath, safeNext } from '../lib/bookingRedirect.ts';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'auth-tab auth-tab--active' : 'auth-tab';

export function AuthTabs() {
  // Switching tab keeps where to go afterwards.
  const next = safeNext(useSearchParams()[0].get('next'));
  return (
    <div className="auth-tabs">
      <NavLink to={authPath('/login', next)} className={tabClass}>
        Sign in
      </NavLink>
      <NavLink to={authPath('/register', next)} className={tabClass}>
        Register
      </NavLink>
    </div>
  );
}
