import { Injectable } from '@nestjs/common';

import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  login(input: LoginDto) {
    return {
      status: 'planned',
      message: 'Authentication flow will be implemented in the backend core phase.',
      loginAttemptFor: input.username,
    };
  }

  refresh() {
    return {
      status: 'planned',
      message: 'Refresh token rotation is scaffolded but not implemented yet.',
    };
  }

  me() {
    return {
      status: 'planned',
      message: 'Authenticated admin profile endpoint will be implemented next.',
    };
  }
}
