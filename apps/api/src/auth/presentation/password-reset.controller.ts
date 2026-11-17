import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ConfirmPasswordResetInput, RequestPasswordResetInput } from '@mountain-hut/shared';
import { confirmPasswordResetSchema, requestPasswordResetSchema } from '@mountain-hut/shared';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { ConfirmPasswordReset } from '../application/confirm-password-reset.js';
import { RequestPasswordReset } from '../application/request-password-reset.js';

// MH-07: password recovery by email. Public: the user is not logged in.
@ApiTags('auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(
    private readonly requestReset: RequestPasswordReset,
    private readonly confirmReset: ConfirmPasswordReset,
  ) {}

  // Same answer whether the email is registered or not.
  @Post('request')
  @HttpCode(200)
  @ApiZodBody(requestPasswordResetSchema)
  async request(
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) body: RequestPasswordResetInput,
  ) {
    await this.requestReset.execute(body);
    return { message: 'If the email is registered, a reset link has been sent' };
  }

  @Post('confirm')
  @HttpCode(200)
  @ApiZodBody(confirmPasswordResetSchema)
  async confirm(
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) body: ConfirmPasswordResetInput,
  ) {
    await this.confirmReset.execute(body);
    return { message: 'Password changed' };
  }
}
