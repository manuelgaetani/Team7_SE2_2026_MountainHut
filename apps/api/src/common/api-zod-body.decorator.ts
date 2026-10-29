import { ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

// Documents in Swagger a request body validated with a Zod schema.
// The Swagger CLI plugin cannot read types inferred from Zod (`z.infer<...>`),
// so the body is described from the schema itself, which stays the only definition.
export function ApiZodBody(schema: z.ZodType): MethodDecorator {
  // `io: 'input'` describes what the client sends, before transforms and defaults.
  const jsonSchema = z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0' });
  return ApiBody({ schema: jsonSchema as SchemaObject });
}
