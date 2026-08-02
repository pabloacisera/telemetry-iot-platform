import { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';

interface RoleGateProps {
  /** Minimum role required: 'viewer' | 'operator' | 'admin'. */
  minimumRole: 'viewer' | 'operator' | 'admin';
  children: ReactNode;
}

/** Role hierarchy for comparison. */
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

/**
 * Conditionally renders children based on the user's role.
 * Uses the hierarchy viewer < operator < admin.
 */
export function RoleGate({ minimumRole, children }: RoleGateProps) {
  const userRole = useSelector((state: RootState) => state.auth.user?.role);
  const level = ROLE_HIERARCHY[userRole ?? ''] ?? -1;
  const required = ROLE_HIERARCHY[minimumRole] ?? 0;

  if (level >= required) {
    return <>{children}</>;
  }

  return null;
}
