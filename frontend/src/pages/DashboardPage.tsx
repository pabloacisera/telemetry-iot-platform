import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { AppDispatch, RootState } from '../store';
import { fetchMotors } from '../store/motors.slice';
import { MotorGrid } from '../components/motors/MotorGrid';
import { AlertBanner } from '../components/alerts/AlertBanner';
import { LoadingSpinner } from '../components/LoadingSpinner';

/**
 * Main dashboard page — shows the grid of 15 motors and active alerts.
 * Fetches initial snapshot on mount, then receives WebSocket updates.
 */
export function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error } = useSelector((state: RootState) => state.motors);

  useEffect(() => {
    dispatch(fetchMotors());
  }, [dispatch]);

  return (
    <div className="dashboard">
      <AlertBanner />
      <div className="dashboard-header">
        <h1>Vista General de Planta</h1>
        <Link to="/referencia" className="ref-link">
          📋 Referencia de estados
        </Link>
      </div>
      {loading && <LoadingSpinner message="Cargando motores..." />}
      {error && <p className="error">{error}</p>}
      {!loading && <MotorGrid />}
    </div>
  );
}
