import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Route guard for admin-only pages:
 * - User is admin → render content.
 * - Any other role → redirect to the dashboard.
 * Must be nested inside ProtectedRoute so the user is guaranteed to exist.
 */
export function AdminRoute() {
  const role = useSelector((state: RootState) => state.auth.user?.role);

  if (role === 'admin') {
    return <Outlet />;
  }

  return <Navigate to="/dashboard" replace />;
}
