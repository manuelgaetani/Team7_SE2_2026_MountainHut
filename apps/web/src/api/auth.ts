import type {
  AuthUser,
  ChangePasswordInput,
  ConfirmPasswordResetInput,
  LoginInput,
  RegisterInput,
  RequestPasswordResetInput,
} from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

export const registerRequest = (input: RegisterInput) => apiPost<AuthUser>('/auth/register', input);

export const loginRequest = (input: LoginInput) => apiPost<AuthUser>('/auth/login', input);

export const refreshRequest = () => apiPost<AuthUser>('/auth/refresh');

export const logoutRequest = () => apiPost<{ message: string }>('/auth/logout');

export const fetchMe = () => apiGet<AuthUser>('/auth/me');

// MH-07: the API answers with the user (mustChangePassword: false) and sets new session cookies.
export const changePasswordRequest = (input: ChangePasswordInput) =>
  apiPost<AuthUser>('/auth/change-password', input);

// MH-07: always the same answer, also for an unknown email.
export const passwordResetRequest = (input: RequestPasswordResetInput) =>
  apiPost<{ message: string }>('/auth/password-reset/request', input);

// MH-07: sets a new password with the code of the link sent by email.
export const passwordResetConfirm = (input: ConfirmPasswordResetInput) =>
  apiPost<{ message: string }>('/auth/password-reset/confirm', input);
