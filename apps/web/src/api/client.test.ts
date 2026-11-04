import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPost, apiPut } from './client.ts';

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (response: Response) => {
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('returns the JSON body', async () => {
    answer(new Response('{"a":1}'));
    await expect(apiGet('/x')).resolves.toEqual({ a: 1 });
  });

  it('sends no body when there is nothing to send', async () => {
    const fetchMock = answer(new Response('{}'));
    await apiPost('/x');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({ method: 'POST', body: undefined }),
    );
  });

  it('supports PUT requests with a JSON body', async () => {
    const fetchMock = answer(new Response('{"updated":true}'));
    const result = await apiPut('/x/1', { name: 'test' });
    expect(result).toEqual({ updated: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x/1',
      expect.objectContaining({
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      }),
    );
  });

  it('supports PUT requests without a body', async () => {
    const fetchMock = answer(new Response('{}'));
    await apiPut('/x/1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x/1',
      expect.objectContaining({ method: 'PUT', body: undefined }),
    );
  });

  it('throws ApiError on failed PUT request', async () => {
    answer(new Response('{"message":"Conflict"}', { status: 409 }));
    await expect(apiPut('/x/1', {})).rejects.toThrow('Conflict');
  });

  it('uses the message of the API in the error', async () => {
    answer(new Response('{"message":"Nope"}', { status: 409 }));
    const error = await apiPost('/x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Nope' });
  });

  it('keeps a generic error when the message is not a string', async () => {
    answer(new Response('{"message":["a"]}', { status: 400 }));
    await expect(apiGet('/x')).rejects.toThrow('GET /x failed with status 400');
  });

  it('keeps a generic error when the body is not JSON', async () => {
    answer(new Response('oops', { status: 502 }));
    await expect(apiPost('/x')).rejects.toThrow('POST /x failed with status 502');
  });
});
