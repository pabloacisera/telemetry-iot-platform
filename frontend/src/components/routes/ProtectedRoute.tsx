import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Route guard — redirects to /login if user is not authenticated
 * AND the refresh attempt has already completed (or failed).
 * Shows nothing while a refresh is in progress (avoids flash to login).
 */
export function ProtectedRoute() {
  const user = useSelector((state: RootState) => state.auth.user);
  const loading = useSelector((state: RootState) => state.auth.loading);

  // While refresh is in progress, don't redirect yet
  if (!user && loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
