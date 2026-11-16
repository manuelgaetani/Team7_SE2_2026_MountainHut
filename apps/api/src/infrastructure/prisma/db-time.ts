// Dates and times are the hut's local values, stored without time zone: a DATE and two TIME
// columns. Prisma maps them to JS Dates at UTC midnight / on 1970-01-01 UTC.
export const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
export const toDbTime = (time: string): Date => new Date(`1970-01-01T${time}:00.000Z`);
export const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);
export const fromDbTime = (time: Date): string => time.toISOString().slice(11, 16);
