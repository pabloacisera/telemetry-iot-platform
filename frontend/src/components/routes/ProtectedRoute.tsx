import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Route guard — redirects to /login if user is not authenticated.
 * Wraps all protected routes (dashboard, motor detail).
 */
export function ProtectedRoute() {
  const user = useSelector((state: RootState) => state.auth.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
