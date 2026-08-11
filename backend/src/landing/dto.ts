import { IsEmail, IsString, MaxLength } from 'class-validator';

/** Landing subscription payload — public endpoint, email only. */
export class SubscribeDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
