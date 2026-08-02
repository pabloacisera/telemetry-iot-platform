import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO for the login endpoint.
 * Validates that email is properly formatted and password is non-empty.
 */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
