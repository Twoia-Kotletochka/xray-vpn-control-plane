import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
