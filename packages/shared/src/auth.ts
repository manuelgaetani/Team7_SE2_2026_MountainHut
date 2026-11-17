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

// A logged-in user changes their password. It also ends the forced change of an account
// created by the staff.
export const changePasswordSchema = z.object({
  currentPassword: loginSchema.shape.password,
  newPassword: registerSchema.shape.password,
});

// a reset link is valid for 24 hours and only once (NIST SP 800-63A-4, section 3.8).
export const PASSWORD_RESET_TTL_HOURS = 24;

// The answer is the same whether the email exists or not, so it does not reveal who is registered.
export const requestPasswordResetSchema = z.object({ email });

// The token comes from the link in the email.
export const confirmPasswordResetSchema = z.object({
  token: z.string().min(1).max(200),
  password: registerSchema.shape.password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
