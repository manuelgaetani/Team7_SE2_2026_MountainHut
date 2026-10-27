// Public entry point: export here the types and schemas shared by api and web.
export interface HealthStatus {
  status: 'ok';
}

export * from './auth.js';