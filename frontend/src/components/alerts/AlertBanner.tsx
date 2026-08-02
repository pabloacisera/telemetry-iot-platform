import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Alert banner — shows active (unresolved) alerts at the top of the page.
 * Fed by WebSocket 'alert' events via the alertsSlice.
 * Auto-updates in real-time without polling.
 */
export function AlertBanner() {
  const alerts = useSelector((state: RootState) => state.alerts.active);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner" role="alert" aria-live="polite">
      <h2>Alertas Activas ({alerts.length})</h2>
      <ul>
        {alerts.slice(0, 5).map((alert) => (
          <li key={alert.id} className={`alert-item alert-${alert.type}`}>
            <strong>Motor {alert.motorId}</strong> — {alert.type.replace(/_/g, ' ')}
            <time>{new Date(alert.triggeredAt).toLocaleTimeString()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
