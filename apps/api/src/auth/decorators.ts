import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { AuthInfo } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Rotta accessibile senza autenticazione. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Inietta l'utente autenticato ({ userId, tenantId }). */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthInfo => {
  return ctx.switchToHttp().getRequest().auth;
});
