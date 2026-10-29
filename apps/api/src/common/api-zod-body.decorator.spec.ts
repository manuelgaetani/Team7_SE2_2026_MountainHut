import { Body, Controller, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { ApiZodBody } from './api-zod-body.decorator.js';

const exampleSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  nickname: z.string().optional(),
  partySize: z.number().int().min(1).default(1),
});

@Controller('examples')
class ExampleController {
  @Post()
  @ApiZodBody(exampleSchema)
  create(@Body() body: unknown) {
    return body;
  }
}

describe('ApiZodBody', () => {
  let app: INestApplication;
  let schema: SchemaObject;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExampleController],
    }).compile();
    app = module.createNestApplication();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const body = document.paths['/examples']?.post?.requestBody;
    if (!body || !('content' in body)) throw new Error('Request body not documented');
    schema = body.content['application/json']?.schema as SchemaObject;
  });

  afterEach(async () => {
    await app.close();
  });

  it('documents the body as a JSON object with every field of the schema', () => {
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties ?? {})).toEqual([
      'email',
      'password',
      'nickname',
      'partySize',
    ]);
  });

  it('keeps the validation rules of the schema', () => {
    expect(schema.properties?.email).toMatchObject({ type: 'string', format: 'email' });
    expect(schema.properties?.password).toMatchObject({ type: 'string', minLength: 8 });
    expect(schema.properties?.partySize).toMatchObject({ type: 'integer', minimum: 1 });
  });

  it('marks as required only the fields the client must send', () => {
    // Optional fields and fields with a default can be left out by the client.
    expect(schema.required).toEqual(['email', 'password']);
  });

  it('produces an OpenAPI 3.0 schema, without the JSON Schema dialect marker', () => {
    expect(schema).not.toHaveProperty('$schema');
  });
});
