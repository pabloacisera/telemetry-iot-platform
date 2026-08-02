import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store';
import { fetchMotors } from '../store/motors.slice';
import { MotorGrid } from '../components/motors/MotorGrid';
import { AlertBanner } from '../components/alerts/AlertBanner';

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
      <h1>Plant Overview</h1>
      {loading && <p>Loading motors...</p>}
      {error && <p className="error">{error}</p>}
      <MotorGrid />
    </div>
  );
}
