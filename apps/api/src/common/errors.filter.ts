import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { FieldValidationError } from '../metadata/field-types';

/** Converte gli errori di dominio in risposte HTTP coerenti. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof FieldValidationError) {
      return res.status(400).json({ statusCode: 400, message: err.message, errors: err.errors });
    }
    if (err instanceof HttpException) {
      const body = err.getResponse();
      return res
        .status(err.getStatus())
        .json(typeof body === 'string' ? { statusCode: err.getStatus(), message: body } : body);
    }
    const pg = err as { code?: string; message?: string };
    if (pg?.code === '23505') {
      return res.status(409).json({ statusCode: 409, message: 'Elemento già esistente' });
    }
    if (pg?.code === '23503') {
      return res.status(409).json({ statusCode: 409, message: 'Elemento collegato ad altri dati' });
    }
    this.logger.error(err instanceof Error ? err.stack : String(err));
    return res.status(500).json({ statusCode: 500, message: 'Errore interno' });
  }
}
