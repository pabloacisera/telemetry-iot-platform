import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JWT strategy for Passport.
 *
 * Extracts the JWT from the Authorization: Bearer header,
 * validates it, and attaches the decoded payload to request.user.
 *
 * The payload contains: { sub: userId, email, role }.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'change_me_in_production',
      ),
    });
  }

  /** Called after JWT is validated. Return value is attached to request.user. */
  validate(payload: { sub: number; email: string; role: string }) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
