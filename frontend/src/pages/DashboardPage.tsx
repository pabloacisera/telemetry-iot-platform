import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { fetchMotors } from '../store/motors.slice';
import { MotorGrid } from '../components/motors/MotorGrid';
import { AlertBanner } from '../components/alerts/AlertBanner';
import { RagQueryBox } from '../components/rag/RagQueryBox';

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
      <h1>Vista General de Planta</h1>
      {loading && <p>Cargando motores...</p>}
      {error && <p className="error">{error}</p>}
      <MotorGrid />
      <RagQueryBox />
    </div>
  );
}
