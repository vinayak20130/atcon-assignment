import { Injectable, type PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

// Returns the parsed value, not the input, so schema transforms like the trim
// and lowercase on an email actually reach the handler.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: 'Request validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
