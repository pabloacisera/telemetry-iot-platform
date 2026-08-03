import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Route guard:
 * - User exists → render protected content.
 * - Refresh not attempted yet → show nothing (blank, <100ms in production).
 * - Refresh attempted, no user → redirect to login.
 */
export function ProtectedRoute() {
  const user = useSelector((state: RootState) => state.auth.user);
  const refreshAttempted = useSelector((state: RootState) => state.auth.refreshAttempted);

  if (user) {
    return <Outlet />;
  }

  if (!refreshAttempted) {
    return null;
  }

  return <Navigate to="/login" replace />;
}
