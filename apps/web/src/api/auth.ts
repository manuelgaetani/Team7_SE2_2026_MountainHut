import type { AuthUser, LoginInput, RegisterInput } from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

export const registerRequest = (input: RegisterInput) => apiPost<AuthUser>('/auth/register', input);

export const loginRequest = (input: LoginInput) => apiPost<AuthUser>('/auth/login', input);

export const refreshRequest = () => apiPost<AuthUser>('/auth/refresh');

export const logoutRequest = () => apiPost<{ message: string }>('/auth/logout');

export const fetchMe = () => apiGet<AuthUser>('/auth/me');
