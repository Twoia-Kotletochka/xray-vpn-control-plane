import { IsString, Matches, MinLength } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
