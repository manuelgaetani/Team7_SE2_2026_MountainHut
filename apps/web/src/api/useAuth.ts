import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@mountain-hut/shared';
import { fetchMe, loginRequest, logoutRequest, refreshRequest, registerRequest } from './auth.ts';
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
