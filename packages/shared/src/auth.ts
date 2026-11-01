import { z } from 'zod';

export const roles = ['HIKER', 'EMPLOYEE', 'WARDEN'] as const;
export type Role = (typeof roles)[number];

const email = z.string().trim().toLowerCase().email();
const utf8Length = (s: string): number => new TextEncoder().encode(s).length;
// bcrypt reads only the first 72 bytes: anything longer would match on its prefix alone.
const fitsBcrypt = (s: string): boolean => utf8Length(s) <= 72;
// PostgreSQL text columns cannot store this character.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');
const digitCount = (s: string): number => s.replace(/\D/g, '').length;

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8)
    .refine(fitsBcrypt, 'Password too long')
    .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), 'Password must contain a letter and a digit'),
  fullName: z
    .string()
    .trim()
    .regex(/\p{L}/u, 'Full name must contain a letter')
    .refine(hasNoNulByte, 'Invalid character'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d\s-]*$/, 'Phone number can contain only digits, spaces and dashes')
    // 15 digits is the international maximum (E.164).
    .refine((p) => digitCount(p) >= 7 && digitCount(p) <= 15, 'Phone number must have 7-15 digits'),
  notes: z.string().trim().refine(hasNoNulByte, 'Invalid character').optional(),
  emergencyContact: z.string().trim().refine(hasNoNulByte, 'Invalid character').optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).refine(fitsBcrypt, 'Password too long'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
