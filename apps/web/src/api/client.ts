const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toApiError(response: Response, method: string, path: string): Promise<ApiError> {
  let message = `${method} ${path} failed with status ${response.status}`;
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // non-JSON body: keep the generic message
  }
  return new ApiError(response.status, message);
}

async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const isGet = method === 'GET';
  const response = await fetch(`${API_BASE}${path}`, {
    ...(isGet ? {} : { method }),
    headers: isGet
      ? { Accept: 'application/json' }
      : { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(isGet ? {} : { body: body === undefined ? undefined : JSON.stringify(body) }),
  });
  if (!response.ok) throw await toApiError(response, method, path);
  return (await response.json()) as T;
}

export const apiGet = <T>(path: string): Promise<T> => send<T>('GET', path);

export const apiPost = <T>(path: string, body?: unknown): Promise<T> => send<T>('POST', path, body);

export const apiPut = <T>(path: string, body?: unknown): Promise<T> => send<T>('PUT', path, body);

export const apiPatch = <T>(path: string, body: unknown): Promise<T> =>
  send<T>('PATCH', path, body);
