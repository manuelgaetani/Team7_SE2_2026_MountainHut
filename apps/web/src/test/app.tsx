import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../router.tsx';

export const user = { id: 1, email: 'hiker@example.test', role: 'HIKER' };

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Routes = Record<string, () => Response>;

// Answers each API path with its handler. Without a session unless the test gives one.
export function stubApi(handlers: Routes = {}) {
  const all: Routes = {
    '/api/auth/me': () => json({}, 401),
    '/api/auth/refresh': () => json({}, 401),
    '/api/health': () => json({ status: 'ok' }),
    ...handlers,
  };
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    const handler = all[url];
    return handler
      ? Promise.resolve(handler())
      : Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

// The JSON body of the first request sent to the path.
export function sentBody(fetchMock: ReturnType<typeof stubApi>, url: string): unknown {
  const call = fetchMock.mock.calls.find(([calledUrl]) => calledUrl === url);
  return JSON.parse(call?.[1]?.body as string);
}
