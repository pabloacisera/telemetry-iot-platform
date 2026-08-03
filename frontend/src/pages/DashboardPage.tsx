import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { AppDispatch, RootState } from '../store';
import { fetchMotors } from '../store/motors.slice';
import { MotorGrid } from '../components/motors/MotorGrid';
import { AlertBanner } from '../components/alerts/AlertBanner';

/**
 * Main dashboard page — shows the grid of 15 motors and active alerts.
 * Waits for auth token before fetching. Shows skeleton until data arrives.
 */
export function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { initialized } = useSelector((state: RootState) => state.motors);
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);

  useEffect(() => {
    if (accessToken && !initialized) {
      dispatch(fetchMotors());
    }
  }, [dispatch, initialized, accessToken]);

  return (
    <div className="dashboard">
      <AlertBanner />
      <div className="dashboard-header">
        <h1>Vista General de Planta</h1>
        <Link to="/referencia" className="ref-link">
          📋 Referencia de estados
        </Link>
      </div>
      {!initialized ? <DashboardSkeleton /> : <MotorGrid />}
    </div>
  );
}

/** Skeleton grid matching the 15-card layout. */
function DashboardSkeleton() {
  return (
    <div className="motor-grid">
      {Array.from({ length: 15 }, (_, i) => (
        <div key={i} className="motor-card-skeleton" aria-hidden="true">
          <div className="skel-line skel-title" />
          <div className="skel-line skel-subtitle" />
          <div className="skel-line skel-sensors" />
        </div>
      ))}
    </div>
  );
}
