import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that requires a valid JWT access token.
 * Apply to any endpoint that needs authentication (regardless of role).
 * Use together with @Roles() for role-based access control.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
