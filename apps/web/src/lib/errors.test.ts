import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.ts';
import { apiErrorMessage, SESSION_EXPIRED } from './errors.ts';

describe('apiErrorMessage', () => {
  it('says the session has expired on 401, even when passed through', () => {
    expect(apiErrorMessage(new ApiError(401, 'Unauthorized'), 'Fallback', [401])).toBe(
      SESSION_EXPIRED,
    );
    expect(SESSION_EXPIRED).toBe('The session has expired. Please sign in again.');
  });

  it('passes the API message through for the listed statuses', () => {
    expect(apiErrorMessage(new ApiError(409, 'Already there'), 'Fallback', [409])).toBe(
      'Already there',
    );
  });

  it('uses the fallback for statuses that are not listed', () => {
    expect(apiErrorMessage(new ApiError(409, 'Already there'), 'Fallback', [403])).toBe('Fallback');
    expect(apiErrorMessage(new ApiError(500, 'boom'), 'Fallback')).toBe('Fallback');
  });

  it('uses the fallback for a plain error', () => {
    expect(apiErrorMessage(new Error('network'), 'Fallback', [409])).toBe('Fallback');
  });
});
