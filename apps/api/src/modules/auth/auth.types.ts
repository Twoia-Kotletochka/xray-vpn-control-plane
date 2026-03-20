import type { AdminRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: AdminRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}
