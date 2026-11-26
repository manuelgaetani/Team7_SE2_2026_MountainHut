import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@mountain-hut/shared';
import { useCurrentUser, useLogout } from './useAuth.ts';

const ME_KEY = ['auth', 'me'];
const user: AuthUser = {
  id: 7,
  email: 'hiker@example.test',
  role: 'HIKER',
  mustChangePassword: false,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// A /api/auth/me answer the test sends when it wants: a slow network.
function heldMe() {
  let release: () => void = () => undefined;
  const answer = new Promise<Response>((resolve) => {
    release = () => resolve(json(user));
  });
  return { answer, release };
}

function setup(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => ({ me: useCurrentUser(), logout: useLogout() }), { wrapper });
}

describe('useLogout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the user signed out when a read of the user started before answers after', async () => {
    const me = heldMe();
    const fetchMock = vi.fn((url: string) =>
      url === '/api/auth/me' ? me.answer : Promise.resolve(json({ message: 'Logged out' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(ME_KEY, user);

    // Mounting reads the user again, as the home page does after Sign out: the answer is held.
    const { result } = setup(queryClient);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.anything()));

    await act(() => result.current.logout.mutateAsync());
    await waitFor(() => expect(result.current.me.data).toBeNull());

    // The read sent with the old session answers after the logout: it must not bring the user back.
    await act(async () => {
      me.release();
      await me.answer;
    });
    await waitFor(() => expect(result.current.me.isFetching).toBe(false));
    expect(result.current.me.data).toBeNull();
    expect(queryClient.getQueryData(ME_KEY)).toBeNull();
  });

  it('forgets the data of the user who signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ message: 'Logged out' }))),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['bookings', 'mine'], [{ id: 1 }]);
    queryClient.setQueryData(['profile', user.id], { fullName: 'Hiker' });

    const { result } = renderHook(() => useLogout(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(['bookings', 'mine'])).toBeUndefined();
    expect(queryClient.getQueryData(['profile', user.id])).toBeUndefined();
    expect(queryClient.getQueryData(ME_KEY)).toBeNull();
  });
});
