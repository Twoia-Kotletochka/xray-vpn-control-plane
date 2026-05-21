import { IsString, MinLength } from 'class-validator';

export class StartTwoFactorSetupDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
