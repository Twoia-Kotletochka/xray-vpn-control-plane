import { IsString, Matches, MinLength } from 'class-validator';

export class EnableTwoFactorDto {
  @IsString()
  @MinLength(16)
  setupToken!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
