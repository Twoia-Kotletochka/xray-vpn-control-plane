import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
}

export interface RequestWithAdmin extends Request {
  admin?: AuthenticatedAdmin;
}
