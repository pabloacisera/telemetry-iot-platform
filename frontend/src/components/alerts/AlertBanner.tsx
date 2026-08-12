import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import type { RootState } from '../../store';
import { alertDismissed } from '../../store/alerts.slice';

/** Milliseconds a toast stays visible before starting fade-out. */
const TOAST_VISIBLE_MS = 8000;
/** Milliseconds the fade-out animation lasts (must match CSS). */
const TOAST_FADEOUT_MS = 800;
/**
 * Milliseconds to ignore hover after mount: a toast can mount UNDER a
 * stationary cursor (top-right corner), which would fire mouseenter and pause
 * the timer forever. Only real user hover pauses.
 */
const HOVER_GRACE_MS = 1000;

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
  sensor_failure_widespread: 'fa-solid fa-circle-exclamation',
};

/**
 * Format alert metadata into a human-readable cause string.
 * Example: "Temperatura: 91.2°C (umbral: 90°C)"
 */
function formatCause(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const parts: string[] = [];

  const sensorLabels: Record<string, string> = {
    temperature: 'Temperatura',
    vibration: 'Vibración',
    current: 'Corriente',
  };

  if (metadata.triggerSensorType && typeof metadata.triggerSensorType === 'string') {
    parts.push(sensorLabels[metadata.triggerSensorType] || metadata.triggerSensorType);
  } else if (metadata.triggerSensorId && typeof metadata.triggerSensorId === 'number') {
    const legacyNames: Record<number, string> = { 1: 'Temperatura', 2: 'Vibración', 3: 'Corriente' };
    parts.push(legacyNames[metadata.triggerSensorId] || `Sensor ${metadata.triggerSensorId}`);
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

interface Alert {
  id: number;
  motorId: number;
  type: string;
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
}

/**
 * Single toast with auto-dismiss timer.
 * Timer pauses on real hover (ignored for the first HOVER_GRACE_MS after mount)
 * and resumes on mouse-leave. Fade-out animation runs before removal.
 */
function AlertToast({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);
  const mountedAtRef = useRef(0);

  function startTimer(remaining: number) {
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setFading(true);
      fadeRef.current = setTimeout(() => onDismiss(), TOAST_FADEOUT_MS);
    }, remaining);
  }

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);
  }

  useEffect(() => {
    mountedAtRef.current = Date.now();
    startedAtRef.current = Date.now();
    startTimer(TOAST_VISIBLE_MS);
    return () => clearTimers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseEnter() {
    if (fading || pausedRef.current) return;
    if (Date.now() - mountedAtRef.current < HOVER_GRACE_MS) return;
    pausedRef.current = true;
    elapsedRef.current += Date.now() - startedAtRef.current;
    clearTimers();
  }

  function handleMouseLeave() {
    if (fading || !pausedRef.current) return;
    pausedRef.current = false;
    const remaining = Math.max(0, TOAST_VISIBLE_MS - elapsedRef.current);
    startTimer(remaining);
  }

  function handleDismiss() {
    clearTimers();
    onDismiss();
  }

  const cause = formatCause(alert.metadata);

  return (
    <div
      className={`alert-toast ${fading ? 'alert-toast--fading' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <i
        className={`alert-toast-icon ${ALERT_ICONS[alert.type] || 'fa-solid fa-circle-exclamation'}`}
        aria-hidden="true"
      />
      <div className="alert-toast-content">
        <div className="alert-toast-message">
          <strong>Motor {alert.motorId}</strong> — {ALERT_LABELS[alert.type] || alert.type.replace(/_/g, ' ')}
        </div>
        {cause && <div className="alert-toast-cause">{cause}</div>}
        <div className="alert-toast-time">
          {new Date(alert.triggeredAt).toLocaleTimeString()}
        </div>
      </div>
      <button
        type="button"
        className="alert-toast-close"
        onClick={handleDismiss}
        aria-label="Cerrar alerta"
      >
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}

/**
 * Alert toast stack — floating notifications in top-right corner.
 * Each toast auto-dismisses after TOAST_VISIBLE_MS with a fade-out animation.
 * Hover pauses the timer (except during the first second after mount). Manual
 * dismiss (✕) cancels and removes immediately.
 * Fed by WebSocket 'alert' events via the alertsSlice.
 */
export function AlertBanner() {
  const dispatch = useDispatch();
  const alerts = useSelector((state: RootState) => state.alerts.active);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner" role="alert" aria-live="polite">
      {alerts.map((alert) => (
        <AlertToast
          key={alert.id}
          alert={alert}
          onDismiss={() => dispatch(alertDismissed(alert.id))}
        />
      ))}
    </div>
  );
}
