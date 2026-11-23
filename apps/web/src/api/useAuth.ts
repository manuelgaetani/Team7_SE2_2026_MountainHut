import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@mountain-hut/shared';
import {
  changePasswordRequest,
  fetchMe,
  loginRequest,
  logoutRequest,
  passwordResetConfirm,
  passwordResetRequest,
  refreshRequest,
  registerRequest,
} from './auth.ts';
import { ApiError } from './client.ts';

const ME_KEY = ['auth', 'me'] as const;

const isUnauthorized = (e: unknown): boolean => e instanceof ApiError && e.status === 401;

// Returns the current user. If the access token has expired, tries once to renew the session
async function fetchMeWithRefresh(): Promise<AuthUser | null> {
  try {
    return await fetchMe();
  } catch (e) {
    if (!isUnauthorized(e)) throw e;
  }
  try {
    return await refreshRequest();
  } catch (e) {
    if (isUnauthorized(e)) return null;
    throw e;
  }
}

// Current user, or null when not logged in
export function useCurrentUser() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMeWithRefresh, retry: false });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

// Registering does not open a session: the user has to log in afterwards
export function useRegister() {
  return useMutation({ mutationFn: registerRequest });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}

// MH-07: the new session user no longer has to change the password.
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: passwordResetRequest });
}

// Setting a new password closes every session: the user has to log in again.
export function useConfirmPasswordReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: passwordResetConfirm,
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}
