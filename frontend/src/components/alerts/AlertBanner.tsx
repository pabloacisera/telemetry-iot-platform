import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { alertDismissed } from '../../store/alerts.slice';

/** Alert type labels in Spanish. */
const ALERT_LABELS: Record<string, string> = {
  warning: 'Advertencia',
  forced_restart: 'Reinicio forzado',
  disabled: 'Deshabilitado',
  sensor_failure_widespread: 'Falla general de sensores',
};

/**
 * Alert banner — shows active (unresolved) alerts at the top of the page.
 * Fed by WebSocket 'alert' events via the alertsSlice.
 * Each alert can be dismissed (hidden from UI, not resolved in backend).
 */
export function AlertBanner() {
  const dispatch = useDispatch();
  const alerts = useSelector((state: RootState) => state.alerts.active);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner" role="alert" aria-live="polite">
      <h2>Alertas Activas ({alerts.length})</h2>
      <ul>
        {alerts.slice(0, 5).map((alert) => (
          <li key={alert.id} className={`alert-item alert-${alert.type}`}>
            <span>
              <strong>Motor {alert.motorId}</strong> — {ALERT_LABELS[alert.type] || alert.type.replace(/_/g, ' ')}
            </span>
            <span className="alert-item-right">
              <time>{new Date(alert.triggeredAt).toLocaleTimeString()}</time>
              <button
                type="button"
                className="alert-dismiss"
                onClick={() => dispatch(alertDismissed(alert.id))}
                aria-label="Cerrar alerta"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
