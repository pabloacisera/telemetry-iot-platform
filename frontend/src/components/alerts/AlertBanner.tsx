import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { alertDismissed } from '../../store/alerts.slice';

/** Alert type labels in Spanish. */
const ALERT_LABELS: Record<string, string> = {
  warning: 'Advertencia',
  motor_alarm: 'Alarma de motor',
  motor_trip: 'Trip forzado',
  motor_disabled: 'Motor deshabilitado',
  forced_restart: 'Reinicio forzado',
  disabled: 'Deshabilitado',
  sensor_failure_widespread: 'Falla general de sensores',
};

/** FontAwesome icon classes per alert type. */
const ALERT_ICONS: Record<string, string> = {
  warning: 'fa-solid fa-triangle-exclamation',
  motor_alarm: 'fa-solid fa-bell',
  motor_trip: 'fa-solid fa-rotate',
  motor_disabled: 'fa-solid fa-ban',
  forced_restart: 'fa-solid fa-rotate',
  disabled: 'fa-solid fa-ban',
  sensor_failure_widespread: 'fa-solid fa-sensor-alert',
};

/** Human-readable sensor names. */
const SENSOR_NAMES: Record<string, string> = {
  1: 'Temperatura',
  2: 'Vibración',
  3: 'Corriente',
};

/**
 * Format alert metadata into a human-readable cause string.
 * Example: "Temperatura: 91.2°C (umbral: 90°C)"
 */
function formatCause(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;

  const parts: string[] = [];

  if (metadata.triggerSensorId && typeof metadata.triggerSensorId === 'number') {
    const sensorName = SENSOR_NAMES[metadata.triggerSensorId] || `Sensor ${metadata.triggerSensorId}`;
    parts.push(sensorName);
  }

  if (metadata.consecutiveReadings && typeof metadata.consecutiveReadings === 'number') {
    parts.push(`${metadata.consecutiveReadings} lecturas consecutivas`);
  }

  if (metadata.reason && typeof metadata.reason === 'string') {
    const reasonLabels: Record<string, string> = {
      critical_reading: 'Lectura crítica',
      grace_timer_expired: 'Tiempo de gracia agotado',
      recurrence_after_restart: 'Recurrencia tras reinicio',
    };
    parts.push(reasonLabels[metadata.reason] || metadata.reason.replace(/_/g, ' '));
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

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
      {alerts.map((alert) => {
        const cause = formatCause(alert.metadata);
        return (
          <div key={alert.id} className="alert-toast">
            <i
              className={`alert-toast-icon ${ALERT_ICONS[alert.type] || 'fa-solid fa-circle-exclamation'}`}
              aria-hidden="true"
            />
            <div className="alert-toast-content">
              <div className="alert-toast-message">
                <strong>Motor {alert.motorId}</strong> — {ALERT_LABELS[alert.type] || alert.type.replace(/_/g, ' ')}
              </div>
              {cause && (
                <div className="alert-toast-cause">
                  {cause}
                </div>
              )}
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
        );
      })}
    </div>
  );
}
