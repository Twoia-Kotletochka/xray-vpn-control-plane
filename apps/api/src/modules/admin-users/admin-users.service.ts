import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminUsersService {
  list() {
    return {
      items: [],
      total: 0,
      capabilities: {
        twoFactorReady: true,
        roleModel: ['SUPER_ADMIN', 'OPERATOR', 'READ_ONLY'],
      },
    };
  }
}
