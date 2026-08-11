import { IsEmail } from 'class-validator';

/**
 * DTO for the "forgot password" endpoint.
 * Only the email is needed; the response is always the same generic message
 * to avoid leaking which accounts exist.
 */
export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}
