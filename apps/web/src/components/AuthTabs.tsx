import { NavLink } from 'react-router';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'auth-tab auth-tab--active' : 'auth-tab';

export function AuthTabs() {
  return (
    <div className="auth-tabs">
      <NavLink to="/login" className={tabClass}>
        Sign in
      </NavLink>
      <NavLink to="/register" className={tabClass}>
        Register
      </NavLink>
    </div>
  );
}
