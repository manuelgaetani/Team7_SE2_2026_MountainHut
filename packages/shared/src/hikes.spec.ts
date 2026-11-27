import { describe, expect, it } from 'vitest';
import {
  MAX_HIKE_DESTINATION_LENGTH,
  MAX_HIKE_PASSAGE_POINT_LENGTH,
  MAX_HIKE_PASSAGE_POINTS,
  MAX_HIKE_ROUTE_LENGTH,
  hikeMoment,
  registerHikeSchema,
} from './hikes.js';

// MH-20 black box: the cases come from the contract of the registration (R2, R3, R4, R8 and the
// Decisions of the story), with equivalence classes and boundary values.

const MAX_DB_INT = 2_147_483_647;

const valid = {
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureDate: '2035-06-01',
  departureTime: '08:00',
  returnDate: '2035-06-01',
  returnTime: '17:00',
};

const parse = (patch: Record<string, unknown>) =>
  registerHikeSchema.safeParse({ ...valid, ...patch });

const issueAt = (patch: Record<string, unknown>, field: string) => {
  const res = parse(patch);
  expect(res.success).toBe(false);
  return res.error?.issues.find((issue) => issue.path[0] === field);
};

describe('hikeMoment', () => {
  it('joins the local date and time into one sortable string', () => {
    expect(hikeMoment('2026-11-25', '08:30')).toBe('2026-11-25T08:30');
  });

  it('orders moments as strings, across days and months', () => {
    expect(hikeMoment('2026-11-25', '23:59') < hikeMoment('2026-11-26', '00:00')).toBe(true);
    expect(hikeMoment('2026-09-30', '12:00') < hikeMoment('2026-10-01', '06:00')).toBe(true);
  });
});

describe('registerHikeSchema', () => {
  describe('valid registrations (R2, R3)', () => {
    it('accepts a complete hike and keeps the passage points in their order', () => {
      const res = parse({});
      expect(res.success).toBe(true);
      expect(res.data?.passagePoints).toEqual(['Forca di Presta', 'Rifugio Tito Zilioli']);
    });

    it('defaults the passage points to an empty list when they are missing', () => {
      const res = registerHikeSchema.safeParse({ ...valid, passagePoints: undefined });
      expect(res.success).toBe(true);
      expect(res.data?.passagePoints).toEqual([]);
    });

    it('accepts an empty list of passage points', () => {
      expect(parse({ passagePoints: [] }).success).toBe(true);
    });

    it('leaves predefinedHikeId out when it is not given', () => {
      const res = parse({});
      expect(res.data).not.toHaveProperty('predefinedHikeId');
    });

    it('trims destination, route and passage points', () => {
      const res = parse({
        destination: '  Monte Vettore ',
        route: '\tvia the lake\n',
        passagePoints: ['  Viso Mozzo  '],
      });
      expect(res.data).toMatchObject({
        destination: 'Monte Vettore',
        route: 'via the lake',
        passagePoints: ['Viso Mozzo'],
      });
    });
  });

  describe('required fields (R2, R3)', () => {
    it.each(['destination', 'route', 'departureDate', 'departureTime', 'returnDate', 'returnTime'])(
      'rejects a hike without %s',
      (field) => {
        const body: Record<string, unknown> = { ...valid };
        delete body[field];
        const res = registerHikeSchema.safeParse(body);
        expect(res.success).toBe(false);
        expect(res.error?.issues.some((issue) => issue.path[0] === field)).toBe(true);
      },
    );

    it.each(['destination', 'route'])('rejects an empty %s', (field) => {
      expect(issueAt({ [field]: '' }, field)?.message).toMatch(/is required/);
    });

    it.each(['destination', 'route'])('rejects a %s of spaces only', (field) => {
      expect(issueAt({ [field]: '   ' }, field)?.message).toMatch(/is required/);
    });

    it('rejects an empty passage point', () => {
      const issue = issueAt({ passagePoints: ['Viso Mozzo', '  '] }, 'passagePoints');
      expect(issue?.path).toEqual(['passagePoints', 1]);
      expect(issue?.message).toBe('Passage point is required');
    });

    it.each([
      ['a number', 42],
      ['null', null],
    ])('rejects a destination that is %s', (_c, destination) => {
      expect(parse({ destination }).success).toBe(false);
    });

    it('rejects passage points that are not a list of strings', () => {
      expect(parse({ passagePoints: 'Viso Mozzo' }).success).toBe(false);
      expect(parse({ passagePoints: [1, 2] }).success).toBe(false);
    });
  });

  describe('lengths (Decisions: Text)', () => {
    it('has the limits of the story', () => {
      expect(MAX_HIKE_DESTINATION_LENGTH).toBe(100);
      expect(MAX_HIKE_ROUTE_LENGTH).toBe(500);
      expect(MAX_HIKE_PASSAGE_POINT_LENGTH).toBe(100);
      expect(MAX_HIKE_PASSAGE_POINTS).toBe(10);
    });

    it.each([
      ['destination', MAX_HIKE_DESTINATION_LENGTH],
      ['route', MAX_HIKE_ROUTE_LENGTH],
    ])('accepts a %s of exactly %i characters and rejects one more', (field, max) => {
      expect(parse({ [field]: 'a'.repeat(max) }).success).toBe(true);
      expect(issueAt({ [field]: 'a'.repeat(max + 1) }, field)?.message).toMatch(
        `at most ${max} characters`,
      );
    });

    it('measures the length after trimming', () => {
      const padded = ` ${'a'.repeat(MAX_HIKE_DESTINATION_LENGTH)} `;
      expect(parse({ destination: padded }).success).toBe(true);
    });

    it('accepts a passage point of exactly 100 characters and rejects one more', () => {
      const max = MAX_HIKE_PASSAGE_POINT_LENGTH;
      expect(parse({ passagePoints: ['a'.repeat(max)] }).success).toBe(true);
      expect(parse({ passagePoints: ['a'.repeat(max + 1)] }).success).toBe(false);
    });

    it('accepts exactly 10 passage points and rejects 11', () => {
      const points = (n: number) => Array.from({ length: n }, (_, i) => `Point ${i + 1}`);
      expect(parse({ passagePoints: points(MAX_HIKE_PASSAGE_POINTS) }).success).toBe(true);
      expect(
        issueAt({ passagePoints: points(MAX_HIKE_PASSAGE_POINTS + 1) }, 'passagePoints')?.message,
      ).toBe('At most 10 passage points');
    });

    it.each([
      ['destination', { destination: 'Monte\u0000Vettore' }],
      ['route', { route: 'via\u0000lake' }],
      ['passagePoints', { passagePoints: ['Viso\u0000Mozzo'] }],
    ])('rejects a NUL character in %s', (field, patch) => {
      expect(issueAt(patch, field)?.message).toMatch(/invalid character/);
    });
  });

  describe('dates and times (R3)', () => {
    it.each(['2035-6-1', '01/06/2035', '2035-06-01T08:00', ''])(
      'rejects the departure date %j',
      (departureDate) => {
        expect(parse({ departureDate }).success).toBe(false);
      },
    );

    it.each(['2035-02-29', '2035-02-30', '2035-04-31', '2035-13-01', '2035-00-10'])(
      'rejects the impossible date %s',
      (returnDate) => {
        expect(issueAt({ returnDate }, 'returnDate')).toBeDefined();
      },
    );

    it('accepts 29 February in a leap year', () => {
      expect(parse({ departureDate: '2036-02-29', returnDate: '2036-02-29' }).success).toBe(true);
    });

    it.each(['8:00', '24:00', '12:60', '0800', '08:00:00', ''])(
      'rejects the time %j',
      (departureTime) => {
        expect(issueAt({ departureTime }, 'departureTime')).toBeDefined();
      },
    );

    it('accepts the first and the last minute of the day', () => {
      expect(parse({ departureTime: '00:00', returnTime: '23:59' }).success).toBe(true);
    });
  });

  describe('return after departure (R4)', () => {
    const RETURN_MESSAGE = 'The expected return must be after the planned departure';

    it('accepts a return one minute after the departure', () => {
      expect(parse({ departureTime: '08:00', returnTime: '08:01' }).success).toBe(true);
    });

    it('rejects a return at the same minute as the departure, on returnTime', () => {
      const issue = issueAt({ returnTime: '08:00' }, 'returnTime');
      expect(issue?.message).toBe(RETURN_MESSAGE);
    });

    it('rejects a return one minute before the departure', () => {
      expect(issueAt({ returnTime: '07:59' }, 'returnTime')?.message).toBe(RETURN_MESSAGE);
    });

    it('rejects a return on an earlier day, even at a later hour', () => {
      const patch = { returnDate: '2035-05-31', returnTime: '23:00' };
      expect(issueAt(patch, 'returnTime')?.message).toBe(RETURN_MESSAGE);
    });

    it('accepts a return on a later day, even at an earlier hour', () => {
      expect(parse({ returnDate: '2035-06-02', returnTime: '06:00' }).success).toBe(true);
    });

    it('accepts a hike across the end of the year', () => {
      const patch = {
        departureDate: '2035-12-31',
        departureTime: '22:00',
        returnDate: '2036-01-01',
        returnTime: '02:00',
      };
      expect(parse(patch).success).toBe(true);
    });
  });

  describe('predefined hike (R8)', () => {
    it.each([1, 2, MAX_DB_INT])('accepts the id %i', (predefinedHikeId) => {
      expect(parse({ predefinedHikeId }).data?.predefinedHikeId).toBe(predefinedHikeId);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, Number.NaN])('rejects the id %s', (predefinedHikeId) => {
      expect(issueAt({ predefinedHikeId }, 'predefinedHikeId')).toBeDefined();
    });

    it.each([
      ['a string', '2'],
      ['null', null],
    ])('rejects an id that is %s', (_c, predefinedHikeId) => {
      expect(parse({ predefinedHikeId }).success).toBe(false);
    });
  });

  // TODO(MH-20-e2e): add Playwright E2E tests of the registration
});
