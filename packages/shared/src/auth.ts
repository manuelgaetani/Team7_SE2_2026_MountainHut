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
    .refine((p) => utf8Length(p) <= 72, 'Password troppo lunga (massimo 72 byte)'),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
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
  firstName: string;
  role: Role;
}
