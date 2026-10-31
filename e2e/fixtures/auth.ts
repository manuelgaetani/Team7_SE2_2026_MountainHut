import { randomUUID } from 'node:crypto';
import { expect, test as base } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

interface AuthFixtures {
  // Credentials of a user that is not registered yet, unique for each test.
  newUser: TestUser;
  // A user that is already registered.
  registeredUser: TestUser;
  // An API client that is logged in as `registeredUser`: it sends the session cookies.
  loggedInRequest: APIRequestContext;
}

// Tests share the database, so every user gets a unique email and no cleanup is needed.
export const test = base.extend<AuthFixtures>({
  // Playwright requires the first argument to be a destructured object, even when empty.
  // eslint-disable-next-line no-empty-pattern
  newUser: async ({}, use) => {
    await use({
      email: `e2e-${randomUUID()}@example.test`,
      password: randomUUID(),
      fullName: 'E2E Hiker',
      phone: '3331234567',
    });
  },

  registeredUser: async ({ request, newUser }, use) => {
    const response = await request.post('/api/auth/register', { data: newUser });
    expect(response.status()).toBe(201);
    await use(newUser);
  },

  loggedInRequest: async ({ playwright, baseURL, registeredUser }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    const response = await context.post('/api/auth/login', {
      data: { email: registeredUser.email, password: registeredUser.password },
    });
    expect(response.status()).toBe(200);
    await use(context);
    await context.dispose();
  },
});

export { expect };
