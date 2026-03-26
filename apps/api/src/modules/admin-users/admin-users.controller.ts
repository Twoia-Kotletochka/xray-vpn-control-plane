import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { StartTwoFactorSetupDto } from './dto/start-two-factor-setup.dto';

@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminUsersService.list(admin);
  }

  @Post()
  create(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() input: CreateAdminUserDto,
    @Req() request: Request,
  ) {
    return this.adminUsersService.create(admin, input, request);
  }

  @Delete(':adminUserId')
  remove(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('adminUserId') adminUserId: string,
    @Req() request: Request,
  ) {
    return this.adminUsersService.remove(admin, adminUserId, request);
  }

  @Get('me/two-factor')
  getTwoFactorStatus(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminUsersService.getSelfTwoFactorStatus(admin);
  }

  @Post('me/two-factor/setup')
  startTwoFactorSetup(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() input: StartTwoFactorSetupDto,
    @Req() request: Request,
  ) {
    return this.adminUsersService.startTwoFactorSetup(admin, input, request);
  }

  @Post('me/two-factor/enable')
  enableTwoFactor(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() input: EnableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.adminUsersService.enableTwoFactor(admin, input, request);
  }

  @Post('me/two-factor/disable')
  disableTwoFactor(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() input: DisableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.adminUsersService.disableTwoFactor(admin, input, request);
  }
}
