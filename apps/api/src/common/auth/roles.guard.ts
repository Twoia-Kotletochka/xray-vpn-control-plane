import { type CanActivate, ForbiddenException, Injectable, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';

import type { RequestWithAdmin } from './authenticated-admin.interface';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowedRoles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const adminRole = request.admin?.role;

    if (!adminRole) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (!allowedRoles.includes(adminRole)) {
      throw new ForbiddenException('Insufficient role permissions.');
    }

    return true;
  }
}
