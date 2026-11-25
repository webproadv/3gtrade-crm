import { BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const errors: Record<string, string> = {};
    for (const issue of r.error.issues) errors[issue.path.join('.') || '_'] = issue.message;
    throw new BadRequestException({ message: 'Dati non validi', errors });
  }
  return r.data;
}
