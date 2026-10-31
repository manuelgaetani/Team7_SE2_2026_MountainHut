import { z } from 'zod';

export const roles = ['HIKER', 'EMPLOYEE', 'WARDEN'] as const;
export type Role = (typeof roles)[number];

const email = z.string().trim().toLowerCase().email();
const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8)
    .refine((p) => utf8Length(p) <= 72, 'Password too long (maximum 72 bytes)'),
  fullName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  emergencyContact: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
