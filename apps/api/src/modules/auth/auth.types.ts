import type { AdminRole } from '@prisma/client';

export interface AuthAdminPayload {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
  twoFactorEnabled: boolean;
}

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

export interface TwoFactorChallengePayload {
  sub: string;
  username: string;
  type: 'two_factor_challenge';
}

export interface TwoFactorSetupPayload {
  sub: string;
  secret: string;
  type: 'two_factor_setup';
}
