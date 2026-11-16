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

const cases: [DomainErrorCode, new (m: string) => HttpException][] = [
  ['NOT_FOUND', NotFoundException],
  ['CONFLICT', ConflictException],
  ['FORBIDDEN', ForbiddenException],
  ['UNPROCESSABLE', UnprocessableEntityException],
  ['UNAUTHORIZED', UnauthorizedException],
];

describe('DomainExceptionFilter', () => {
  it.each(cases)('maps %s to the same status and body as Nest', (code, Ctor) => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new DomainExceptionFilter().catch(new DomainError(code, 'x'), host);

    const expected = new Ctor('x');
    expect(status).toHaveBeenCalledWith(expected.getStatus());
    expect(json).toHaveBeenCalledWith(expected.getResponse());
  });
});
