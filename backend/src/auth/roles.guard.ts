import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard that checks if the authenticated user has one of the required roles.
 *
 * Used with the @Roles('admin', 'operator') decorator on controller methods.
 * If no @Roles decorator is present, access is allowed (public or just needs auth).
 * If the user's role is not in the allowed list, throws 403 Forbidden.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles decorator → allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role?: string };
    }>();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('No role found in token');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role '${user.role}' does not have access. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
