import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for the "reset password" endpoint.
 * Validates the single-use token and the new password strength.
 */
export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  newPassword!: string;
}
