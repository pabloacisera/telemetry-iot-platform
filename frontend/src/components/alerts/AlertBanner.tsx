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

/** FontAwesome icon classes per alert type. */
const ALERT_ICONS: Record<string, string> = {
  warning: 'fa-solid fa-triangle-exclamation',
  forced_restart: 'fa-solid fa-rotate',
  disabled: 'fa-solid fa-ban',
  sensor_failure_widespread: 'fa-solid fa-sensor-alert',
};

/**
 * Alert toast stack — floating notifications in top-right corner.
 * Each toast stays visible until the operator manually dismisses it.
 * Fed by WebSocket 'alert' events via the alertsSlice.
 */
export function AlertBanner() {
  const dispatch = useDispatch();
  const alerts = useSelector((state: RootState) => state.alerts.active);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner" role="alert" aria-live="polite">
      {alerts.map((alert) => (
        <div key={alert.id} className="alert-toast">
          <i
            className={`alert-toast-icon ${ALERT_ICONS[alert.type] || 'fa-solid fa-circle-exclamation'}`}
            aria-hidden="true"
          />
          <div className="alert-toast-content">
            <div className="alert-toast-message">
              <strong>Motor {alert.motorId}</strong> — {ALERT_LABELS[alert.type] || alert.type.replace(/_/g, ' ')}
            </div>
            <div className="alert-toast-time">
              {new Date(alert.triggeredAt).toLocaleTimeString()}
            </div>
          </div>
          <button
            type="button"
            className="alert-toast-close"
            onClick={() => dispatch(alertDismissed(alert.id))}
            aria-label="Cerrar alerta"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      ))}
    </div>
  );
}
