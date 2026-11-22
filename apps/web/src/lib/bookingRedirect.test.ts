import { describe, expect, it } from 'vitest';
import { authPath, bookingPath, draftFromSearch, safeNext } from './bookingRedirect.ts';

describe('bookingRedirect helpers', () => {
  describe('bookingPath', () => {
    it('builds /book URL with encoded date, time, and partySize', () => {
      expect(bookingPath({ date: '2026-11-14', time: '12:00', partySize: 4 })).toBe(
        '/book?date=2026-11-14&time=12%3A00&partySize=4',
      );
    });
  });

  describe('authPath', () => {
    it('returns the bare auth route when next is null', () => {
      expect(authPath('/login', null)).toBe('/login');
      expect(authPath('/register', null)).toBe('/register');
    });

    it('encodes next in the query string when provided', () => {
      const next = '/book?date=2026-11-14&time=12:00&partySize=4';
      expect(authPath('/login', next)).toBe(`/login?${new URLSearchParams({ next }).toString()}`);
      expect(authPath('/register', next)).toBe(
        `/register?${new URLSearchParams({ next }).toString()}`,
      );
    });
  });

  describe('safeNext', () => {
    it('accepts relative internal paths', () => {
      expect(safeNext('/book')).toBe('/book');
      expect(safeNext('/book?date=2026-11-14&time=12:00&partySize=2')).toBe(
        '/book?date=2026-11-14&time=12:00&partySize=2',
      );
    });

    it.each([null, '', 'book', 'https://evil.example', '//evil.example/book', '/\\evil.example'])(
      'rejects unsafe or missing path %j',
      (candidate) => {
        expect(safeNext(candidate)).toBeNull();
      },
    );
  });

  describe('draftFromSearch', () => {
    it('parses a complete and valid booking draft from URLSearchParams', () => {
      const params = new URLSearchParams('date=2026-11-14&time=12:00&partySize=3');
      expect(draftFromSearch(params)).toEqual({
        date: '2026-11-14',
        time: '12:00',
        partySize: 3,
      });
    });

    it.each([
      'time=12:00&partySize=3',
      'date=2026-11-1&time=12:00&partySize=3',
      'date=2026-11-14&partySize=3',
      'date=2026-11-14&time=1200&partySize=3',
      'date=2026-11-14&time=12:00',
      'date=2026-11-14&time=12:00&partySize=0',
      'date=2026-11-14&time=12:00&partySize=-2',
      'date=2026-11-14&time=12:00&partySize=2.5',
      'date=2026-11-14&time=12:00&partySize=abc',
    ])('returns null for invalid query %j', (query) => {
      expect(draftFromSearch(new URLSearchParams(query))).toBeNull();
    });
  });
});
