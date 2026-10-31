import { expect, test } from '../../fixtures/auth.js';

test.describe('register', () => {
  test('creates a hiker account', async ({ request, newUser }) => {
    const response = await request.post('/api/auth/register', { data: newUser });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      email: newUser.email,
      role: 'HIKER',
    });
    expect(body).not.toHaveProperty('password');
  });

  test('rejects an email that is already registered', async ({ request, registeredUser }) => {
    const response = await request.post('/api/auth/register', { data: registeredUser });
    expect(response.status()).toBe(409);
  });

  test('rejects a full name the database cannot store', async ({ request, newUser }) => {
    const response = await request.post('/api/auth/register', {
      data: { ...newUser, fullName: 'E2E\u0000User' },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects an invalid body', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', password: 'short' },
    });
    expect(response.status()).toBe(400);
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

  test('answers 401 and not 500 to a refresh cookie that is not a token', async ({ request }) => {
    const response = await request.post('/api/auth/refresh', {
      headers: { cookie: 'refresh_token=j:{"a":1}' },
    });
    expect(response.status()).toBe(401);
  });

  test('logout ends the session', async ({ loggedInRequest }) => {
    expect((await loggedInRequest.post('/api/auth/logout')).status()).toBe(200);
    expect((await loggedInRequest.get('/api/auth/me')).status()).toBe(401);
  });
});
