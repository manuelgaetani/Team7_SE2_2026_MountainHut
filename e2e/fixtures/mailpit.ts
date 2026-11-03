import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function search(request: APIRequestContext, to: string): Promise<{ ID: string }[]> {
  const query = encodeURIComponent(`to:"${to}"`);
  const response = await request.get(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  expect(response.status()).toBe(200);
  const { messages } = (await response.json()) as { messages: { ID: string }[] };
  return messages;
}

// How many emails Mailpit holds for an address right now.
export async function emailCount(request: APIRequestContext, to: string): Promise<number> {
  return (await search(request, to)).length;
}

// The API sends the email after answering, so it can arrive a moment later: waits until
// there are exactly `count` emails for the address, then returns them.
export async function waitForEmails(
  request: APIRequestContext,
  to: string,
  count: number,
): Promise<MailpitMessage[]> {
  let ids: string[] = [];
  await expect
    .poll(async () => {
      ids = (await search(request, to)).map((m) => m.ID);
      return ids.length;
    })
    .toBe(count);
  return Promise.all(
    ids.map(async (id) => {
      const response = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
      return (await response.json()) as MailpitMessage;
    }),
  );
}