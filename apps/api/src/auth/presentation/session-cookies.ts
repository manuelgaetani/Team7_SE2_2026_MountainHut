// Name of the httpOnly cookie that carries the JWT access token.
export const ACCESS_COOKIE = 'token';
export const REFRESH_COOKIE = 'refresh_token';
// The refresh cookie is sent only to the /api/auth/* routes.
export const REFRESH_PATH = '/api/auth';
