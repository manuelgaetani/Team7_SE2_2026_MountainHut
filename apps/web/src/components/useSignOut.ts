import { useNavigate } from 'react-router';
import { useLogout } from '../api/useAuth.ts';
import { useToast } from './Toast.tsx';

// Signs out from anywhere (navigation bar, profile menu) and says so with a toast.
export function useSignOut() {
  const logout = useLogout();
  const toast = useToast();
  const navigate = useNavigate();

  const signOut = () => {
    // Go home first, then sign out: the page left behind never sees the user
    // disappear, so it cannot send them somewhere else (e.g. /unauthorized).
    void navigate('/', { replace: true });
    // A promise, not mutate callbacks: the page that started it may be gone (e.g. the profile).
    logout.mutateAsync().then(
      () => toast.show({ message: 'You have signed out. See you soon!' }),
      () => toast.show({ kind: 'error', message: 'Sign out failed. Please try again.' }),
    );
  };

  return { signOut, isPending: logout.isPending };
}
