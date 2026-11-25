export interface AuthInfo {
  userId: string;
  tenantId: string;
}

export interface JwtPayload {
  sub: string;
  tid: string;
}
