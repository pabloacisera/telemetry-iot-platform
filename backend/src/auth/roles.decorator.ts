import { SetMetadata } from '@nestjs/common';

/**
 * Key used by RolesGuard to read allowed roles from handler metadata.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access an endpoint.
 * Usage: @Roles('admin', 'operator')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
