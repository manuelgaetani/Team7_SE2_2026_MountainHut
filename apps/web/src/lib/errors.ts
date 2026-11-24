import { ApiError } from '../api/client.ts';

export const SESSION_EXPIRED = 'The session has expired. Please sign in again.';

// What a person reads when a request failed: the session notice on 401, the API's own message
// for the statuses it explains (`passthrough`), the fallback for anything else.
export function apiErrorMessage(
  e: unknown,
  fallback: string,
  passthrough: readonly number[] = [],
): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return SESSION_EXPIRED;
    if (passthrough.includes(e.status)) return e.message;
  }
  return fallback;
}
