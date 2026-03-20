import { Body, Controller, Get, Post } from '@nestjs/common';

import type { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Post('refresh')
  refresh() {
    return this.authService.refresh();
  }

  @Get('me')
  me() {
    return this.authService.me();
  }
}
