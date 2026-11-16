export type DomainErrorCode =
  'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'UNPROCESSABLE' | 'UNAUTHORIZED';

// Framework-free business error: the presentation layer maps it to HTTP.
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
