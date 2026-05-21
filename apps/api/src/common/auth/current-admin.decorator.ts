import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedAdmin, RequestWithAdmin } from './authenticated-admin.interface';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();

    if (!request.admin) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return request.admin;
  },
);
