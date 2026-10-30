import type { APIRequestContext, APIResponse, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';

const setCookies = (response: APIResponse): string[] =>
  response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);

const cookieValue = async (context: APIRequestContext, name: string) => {
  const { cookies } = await context.storageState();
  return cookies.find((c) => c.name === name)?.value;
};

// A client that sends exactly the given Cookie header, e.g. an attacker replaying a stolen token.
const clientWithCookie = (
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  cookie: string,
) => playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie } });

test.describe('register', () => {
  test('creates a hiker account', async ({ request, newUser }) => {
    const response = await request.post('/api/auth/register', { data: newUser });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      email: newUser.email,
      firstName: newUser.firstName,
      role: 'HIKER',
    });
    expect(body).not.toHaveProperty('password');
  });

  test('rejects an email that is already registered', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/register', { data: registeredUser });
    expect(response.status()).toBe(409);
  });

  test('rejects an invalid body', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', password: 'short' },
    });
    expect(response.status()).toBe(400);
  });

  test('reports which fields are invalid', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', password: 'short' },
    });
    const body = await response.json();
    const fields = (body.issues as { path: string[] }[]).map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'firstName']));
  });

  test('treats the email as case-insensitive', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/register', {
      data: { ...registeredUser, email: registeredUser.email.toUpperCase() },
    });
    expect(response.status()).toBe(409);
  });

  test('ignores a role sent by the client: new accounts are always hikers', async ({
    request,
    newUser,
  }) => {
    const response = await request.post('/api/auth/register', {
      data: { ...newUser, role: 'WARDEN' },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).role).toBe('HIKER');

    await request.post('/api/auth/login', {
      data: { email: newUser.email, password: newUser.password },
    });
    const me = await request.get('/api/auth/me');
    expect((await me.json()).role).toBe('HIKER');
  });
});

test.describe('login', () => {
  test('sets the session cookies', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: registeredUser.email, password: registeredUser.password },
    });
    expect(response.status()).toBe(200);
    const cookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    expect(cookies.map((c) => c.value.split('=')[0]).sort()).toEqual(['refresh_token', 'token']);
    expect(cookies.every((c) => /HttpOnly/i.test(c.value))).toBe(true);
  });

  test('rejects a wrong password', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: registeredUser.email, password: `${registeredUser.password}-wrong` },
    });
    expect(response.status()).toBe(401);
  });

  test('returns the user but never the tokens', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: registeredUser.email, password: registeredUser.password },
    });
    const body = await response.json();
    expect(body).toEqual({
      id: expect.any(Number),
      email: registeredUser.email,
      firstName: registeredUser.firstName,
      role: 'HIKER',
    });
    const tokens = setCookies(response).map((c) => c.split(';')[0].split('=')[1]);
    for (const token of tokens) {
      expect(JSON.stringify(body)).not.toContain(token);
    }
  });

  test('uses SameSite=Lax and limits the refresh cookie to /api/auth', async ({
    request,
    registeredUser,
  }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: registeredUser.email, password: registeredUser.password },
    });
    const cookies = setCookies(response);
    const access = cookies.find((c) => c.startsWith('token='));
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/Path=\/api\/auth(;|$)/i);
    expect(refresh).toMatch(/Expires=/i);
  });

  test('gives the same answer for an unknown email as for a wrong password', async ({
    request,
    registeredUser,
  }) => {
    const wrongPassword = await request.post('/api/auth/login', {
      data: { email: registeredUser.email, password: 'wrong-password' },
    });
    const unknownEmail = await request.post('/api/auth/login', {
      data: { email: `unknown-${registeredUser.email}`, password: 'wrong-password' },
    });
    expect(unknownEmail.status()).toBe(401);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });

  test('accepts the email in any letter case', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: registeredUser.email.toUpperCase(), password: registeredUser.password },
    });
    expect(response.status()).toBe(200);
  });
});

test.describe('session', () => {
  test('returns the current user', async ({ loggedInRequest, registeredUser }) => {
    const response = await loggedInRequest.get('/api/auth/me');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ email: registeredUser.email });
  });

  test('rejects a request without session', async ({ request }) => {
    const response = await request.get('/api/auth/me');
    expect(response.status()).toBe(401);
  });

  test('rotates the refresh token and revokes all sessions when an old one is reused', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const { cookies } = await loggedInRequest.storageState();
    const oldRefresh = cookies.find((c) => c.name === 'refresh_token');
    expect(oldRefresh).toBeDefined();

    expect((await loggedInRequest.post('/api/auth/refresh')).status()).toBe(200);

    // An attacker replays the refresh token that was already used.
    const attacker = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `refresh_token=${oldRefresh!.value}` },
    });
    expect((await attacker.post('/api/auth/refresh')).status()).toBe(401);
    await attacker.dispose();

    // The reuse revoked the session of the real user too.
    expect((await loggedInRequest.post('/api/auth/refresh')).status()).toBe(401);
  });

  test('logout ends the session', async ({ loggedInRequest }) => {
    expect((await loggedInRequest.post('/api/auth/logout')).status()).toBe(200);
    expect((await loggedInRequest.get('/api/auth/me')).status()).toBe(401);
  });

  test('rejects a forged access token', async ({ playwright, baseURL }) => {
    const attacker = await clientWithCookie(playwright, baseURL, 'token=forged.token.value');
    expect((await attacker.get('/api/auth/me')).status()).toBe(401);
    await attacker.dispose();
  });

  test('rejects an access token whose role was changed', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const token = await cookieValue(loggedInRequest, 'token');
    expect(token).toBeDefined();
    const [header, payload, signature] = token!.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const promoted = Buffer.from(JSON.stringify({ ...claims, role: 'WARDEN' })).toString(
      'base64url',
    );

    const attacker = await clientWithCookie(
      playwright,
      baseURL,
      `token=${header}.${promoted}.${signature}`,
    );
    expect((await attacker.get('/api/auth/me')).status()).toBe(401);
    await attacker.dispose();
  });

  test('rejects a refresh without the refresh cookie', async ({ request }) => {
    expect((await request.post('/api/auth/refresh')).status()).toBe(401);
  });

  test('refresh issues a new working session', async ({ loggedInRequest, registeredUser }) => {
    const before = await cookieValue(loggedInRequest, 'refresh_token');
    const response = await loggedInRequest.post('/api/auth/refresh');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ email: registeredUser.email });
    expect(await cookieValue(loggedInRequest, 'refresh_token')).not.toBe(before);
    expect((await loggedInRequest.get('/api/auth/me')).status()).toBe(200);
  });

  test('logout revokes the refresh token on the server, not only in the client', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const refresh = await cookieValue(loggedInRequest, 'refresh_token');
    expect((await loggedInRequest.post('/api/auth/logout')).status()).toBe(200);

    const replay = await clientWithCookie(playwright, baseURL, `refresh_token=${refresh}`);
    expect((await replay.post('/api/auth/refresh')).status()).toBe(401);
    await replay.dispose();
  });

  test('logging out of one session keeps the other sessions', async ({
    registeredUser,
    playwright,
    baseURL,
  }) => {
    const login = async () => {
      const client = await playwright.request.newContext({ baseURL });
      const response = await client.post('/api/auth/login', {
        data: { email: registeredUser.email, password: registeredUser.password },
      });
      expect(response.status()).toBe(200);
      return client;
    };
    const phone = await login();
    const laptop = await login();

    expect((await phone.post('/api/auth/logout')).status()).toBe(200);
    expect((await laptop.post('/api/auth/refresh')).status()).toBe(200);
    expect((await laptop.get('/api/auth/me')).status()).toBe(200);

    await phone.dispose();
    await laptop.dispose();
  });

  test('logout without a session still succeeds', async ({ request }) => {
    expect((await request.post('/api/auth/logout')).status()).toBe(200);
  });
});

test.describe('API documentation', () => {
  test('documents every auth endpoint of the running system', async ({ request }) => {
    const response = await request.get('/api/docs-json');
    expect(response.status()).toBe(200);
    const { paths } = await response.json();
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/register',
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/auth/logout',
        '/api/auth/me',
      ]),
    );
    expect(paths['/api/auth/me'].get.security).toEqual([{ cookie: [] }]);
  });
});
