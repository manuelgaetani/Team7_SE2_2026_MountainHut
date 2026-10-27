import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

// Interactive API documentation at /api/docs, raw OpenAPI JSON at /api/docs-json.
// Protected endpoints declare @ApiBearerAuth() so the "Authorize" button applies to them.
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Mountain Hut API')
    .setDescription('REST API of the Mountain Hut system')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
