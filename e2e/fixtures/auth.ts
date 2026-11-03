import { randomUUID } from 'node:crypto';
import { expect, test as base } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { setUserRole } from './db.js';

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
  // A user registered with role EMPLOYEE.
  employeeUser: TestUser;
  // A user registered with role WARDEN.
  wardenUser: TestUser;
  // An API client that is logged in as `registeredUser`: it sends the session cookies.
  loggedInRequest: APIRequestContext;
  // An API client logged in as an EMPLOYEE.
  employeeRequest: APIRequestContext;
  // An API client logged in as a WARDEN.
  wardenRequest: APIRequestContext;
}

// Tests share the database, so every user gets a unique email and no cleanup is needed.
export const test = base.extend<AuthFixtures>({
  // Playwright requires the first argument to be a destructured object, even when empty.
  // eslint-disable-next-line no-empty-pattern
  newUser: async ({}, use) => {
    await use({
      email: `e2e-${randomUUID()}@example.test`,
      password: randomUUID(),
      fullName: 'E2E User',
      phone: '+39 333 1234567',
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

  employeeUser: async ({ request }, use) => {
    const user: TestUser = {
      email: `e2e-employee-${randomUUID()}@example.test`,
      password: randomUUID(),
      fullName: 'E2E Employee',
      phone: '+39 333 0000001',
    };
    const regRes = await request.post('/api/auth/register', { data: user });
    expect(regRes.status()).toBe(201);
    setUserRole(user.email, 'EMPLOYEE');
    await use(user);
  },

  wardenUser: async ({ request }, use) => {
    const user: TestUser = {
      email: `e2e-warden-${randomUUID()}@example.test`,
      password: randomUUID(),
      fullName: 'E2E Warden',
      phone: '+39 333 0000002',
    };
    const regRes = await request.post('/api/auth/register', { data: user });
    expect(regRes.status()).toBe(201);
    setUserRole(user.email, 'WARDEN');
    await use(user);
  },

  employeeRequest: async ({ playwright, baseURL, employeeUser }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    const loginRes = await context.post('/api/auth/login', {
      data: { email: employeeUser.email, password: employeeUser.password },
    });
    expect(loginRes.status()).toBe(200);

    await use(context);
    await context.dispose();
  },

  wardenRequest: async ({ playwright, baseURL, wardenUser }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    const loginRes = await context.post('/api/auth/login', {
      data: { email: wardenUser.email, password: wardenUser.password },
    });
    expect(loginRes.status()).toBe(200);

    await use(context);
    await context.dispose();
  },
});

export { expect };
