import { NavLink, Outlet } from 'react-router';
import { isStaff, ROLE_LABEL } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useSignOut } from './useSignOut.ts';
import '../pages/ProfilePage.css';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'profile-nav__link profile-nav__link--active' : 'profile-nav__link';

// The personal area: profile, bookings, hikes and password share one page with a side menu.
// Without a session, or while a temporary password must be replaced, the page shows alone.
export function ProfileLayout() {
  const { data: user } = useCurrentUser();
  const { signOut, isPending } = useSignOut();

  const shell = user && !user.mustChangePassword ? user : null;

  // The same tree with or without the shell: the page inside keeps its state when the shell
  // appears (e.g. the "password changed" message once a temporary password is replaced).
  return (
    <div className={shell ? 'profile' : undefined}>
      {shell && (
        <section className="profile__hero">
          <div className="profile__hero-inner">
            <span className="avatar avatar--hero" aria-hidden="true">
              {shell.email.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="profile__eyebrow">Your personal area</p>
              <p className="profile__email">{shell.email}</p>
              <p className="profile__role">{ROLE_LABEL[shell.role]}</p>
            </div>
          </div>
        </section>
      )}

      <div className={shell ? 'profile__body' : undefined}>
        {shell && (
          <nav className="profile-nav" aria-label="Personal area">
            <NavLink to="/profile" end className={tabClass}>
              My profile
            </NavLink>
            {!isStaff(shell) && (
              <>
                <NavLink to="/bookings" className={tabClass}>
                  My bookings
                </NavLink>
                <NavLink to="/hikes" end className={tabClass}>
                  My hikes
                </NavLink>
              </>
            )}
            <NavLink to="/change-password" className={tabClass}>
              Change password
            </NavLink>
            <button
              type="button"
              className="profile-nav__link profile-nav__signout"
              onClick={signOut}
              disabled={isPending}
            >
              Sign out
            </button>
          </nav>
        )}
        <div className={shell ? 'profile__panel' : undefined}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
