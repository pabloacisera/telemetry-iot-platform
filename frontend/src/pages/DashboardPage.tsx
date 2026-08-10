import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { AppDispatch, RootState } from '../store';
import { fetchMotors } from '../store/motors.slice';
import { MotorGrid } from '../components/motors/MotorGrid';
import { AlertBanner } from '../components/alerts/AlertBanner';
import { RoleGate } from '../components/routes/RoleGate';

/**
 * Main dashboard page — shows the grid of 15 motors.
 * Layout: header with action buttons, then grid in a differentiated container.
 * AlertBanner renders as floating toasts (position: fixed), outside the flow.
 */
/**
 * Grafana quick-access link in the header. The URL is injected at build time
 * via the VITE_GRAFANA_URL build arg (defaults to http://localhost:3001/grafana/).
 */
const grafanaUrl = import.meta.env.VITE_GRAFANA_URL as string | undefined;

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
        <div className="dashboard-links">
          {grafanaUrl && (
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grafana-link"
            >
              <i className="fa-solid fa-chart-line" aria-hidden="true" /> Grafana
            </a>
          )}
          <Link to="/alertas" className="ref-link">
            <i className="fa-solid fa-bell" aria-hidden="true" /> Alertas
          </Link>
          <Link to="/referencia" className="ref-link">
            <i className="fa-solid fa-book" aria-hidden="true" /> Referencia
          </Link>
          <RoleGate minimumRole="admin">
            <Link to="/config" className="ref-link">
              <i className="fa-solid fa-gear" aria-hidden="true" /> Configuración
            </Link>
          </RoleGate>
        </div>
      </div>

      <div className="dashboard-grid-container">
        {!initialized ? <DashboardSkeleton /> : <MotorGrid />}
      </div>
    </div>
  );
}

/** Skeleton grid matching the 3-column × 5-row layout. */
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
