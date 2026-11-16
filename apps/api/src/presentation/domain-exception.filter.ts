import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  type HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorCode } from '../shared-kernel/domain-error.js';

const factories: Record<DomainErrorCode, (message: string) => HttpException> = {
  NOT_FOUND: (m) => new NotFoundException(m),
  CONFLICT: (m) => new ConflictException(m),
  FORBIDDEN: (m) => new ForbiddenException(m),
  UNPROCESSABLE: (m) => new UnprocessableEntityException(m),
  UNAUTHORIZED: (m) => new UnauthorizedException(m),
};

// Maps domain errors to the exact HTTP responses Nest's built-in exceptions produce.
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const http = factories[error.code](error.message);
    host.switchToHttp().getResponse<Response>().status(http.getStatus()).json(http.getResponse());
  }
}
