import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import type { AuthUser } from '@mountain-hut/shared';
import { isStaff, ROLE_LABEL } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useSignOut } from './useSignOut.ts';

// "name@domain" with a line-break opportunity before the "@".
function emailParts(email: string) {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link nav-link--active' : 'nav-link';

// The account indicator on the right of the bar: opens the links of the personal area.
function ProfileMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const { signOut, isPending } = useSignOut();
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = user.email.charAt(0).toUpperCase();

  // A new page closes the menu.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="profile-menu__toggle"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="profile-menu__name" aria-hidden="true">
          Profile
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="profile-menu__panel">
          <div className="profile-menu__who">
            <span className="avatar avatar--large" aria-hidden="true">
              {initial}
            </span>
            <span>
              <strong>{emailParts(user.email)}</strong>
              <span className="profile-menu__role">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <Link to="/profile" className="profile-menu__item">
            My profile
          </Link>
          {!isStaff(user) && (
            <>
              <Link to="/bookings" className="profile-menu__item">
                My bookings
              </Link>
              <Link to="/hikes" className="profile-menu__item">
                My hikes
              </Link>
            </>
          )}
          <Link to="/change-password" className="profile-menu__item">
            Change password
          </Link>
          <button
            type="button"
            className="profile-menu__item profile-menu__signout"
            onClick={signOut}
            disabled={isPending}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const { data: user, isPending } = useCurrentUser();
  const { pathname } = useLocation();
  // The auth pages already have their own Sign in / Register tabs.
  const onAuthPage = pathname === '/login' || pathname === '/register';

  let links = null;
  let account = null;
  if (!isPending) {
    if (user) {
      links = isStaff(user) ? (
        <>
          <NavLink to="/staff/slots" className={navClass}>
            Time slots
          </NavLink>
          <NavLink to="/staff/bookings/new" className={navClass}>
            New booking
          </NavLink>
          <NavLink to="/staff/hikes" className={navClass}>
            Hikes
          </NavLink>
        </>
      ) : (
        <>
          <NavLink to="/book" className={navClass}>
            Book a table
          </NavLink>
          <NavLink to="/availability" className={navClass}>
            Availability
          </NavLink>
          <NavLink to="/hikes/new" className={navClass}>
            Register a hike
          </NavLink>
        </>
      );
      account = <ProfileMenu user={user} />;
    } else {
      links = (
        <NavLink to="/availability" className={navClass}>
          Availability
        </NavLink>
      );
      if (!onAuthPage) {
        account = (
          <>
            <NavLink to="/login" className="pill">
              Sign in
            </NavLink>
            <NavLink to="/register" className="pill pill--solid">
              Register
            </NavLink>
          </>
        );
      }
    }
  }

  return (
    <nav className="nav">
      <Link to="/" className="brand">
        Mountain Hut
      </Link>
      <div className="nav-links">{links}</div>
      <div className="nav-actions">{account}</div>
    </nav>
  );
}
