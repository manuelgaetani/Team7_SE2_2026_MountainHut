import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './auth/presentation/session-cookies.js';

export const SWAGGER_PATH = 'api/docs';

// Interactive API documentation at /api/docs, raw OpenAPI JSON at /api/docs-json.
// The session lives in httpOnly cookies: calling the login endpoint from the UI makes the
// browser store them and send them with every next request. Protected endpoints declare
// @ApiCookieAuth() so the documentation shows they need the session.
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Mountain Hut API')
    .setDescription('REST API of the Mountain Hut system')
    .setVersion('0.0.1')
    .addCookieAuth(ACCESS_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
