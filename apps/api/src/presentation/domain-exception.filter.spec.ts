import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainError, type DomainErrorCode } from '../shared-kernel/domain-error.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

const cases: [DomainErrorCode, new (m: string) => HttpException, number, string][] = [
  ['NOT_FOUND', NotFoundException, 404, 'Not Found'],
  ['CONFLICT', ConflictException, 409, 'Conflict'],
  ['FORBIDDEN', ForbiddenException, 403, 'Forbidden'],
  ['UNPROCESSABLE', UnprocessableEntityException, 422, 'Unprocessable Entity'],
  ['UNAUTHORIZED', UnauthorizedException, 401, 'Unauthorized'],
];

describe('DomainExceptionFilter', () => {
  it.each(cases)('maps %s to the same status and body as Nest', (code, Ctor, statusCode, error) => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new DomainExceptionFilter().catch(new DomainError(code, 'x'), host);

    const expected = new Ctor('x');
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({ statusCode, message: 'x', error });
    expect(status).toHaveBeenCalledWith(expected.getStatus());
    expect(json).toHaveBeenCalledWith(expected.getResponse());
  });
});
