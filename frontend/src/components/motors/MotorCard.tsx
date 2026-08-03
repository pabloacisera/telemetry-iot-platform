import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KeyboardEvent } from 'react';
import { StatusBadge } from './StatusBadge';

interface MotorCardProps {
  motor: {
    id: number;
    code: string;
    name: string;
    location: string | null;
    status: string;
    sensors: Record<string, {
      sensorType: string;
      lastValue: number | null;
      lastReadingAt: string | null;
      status: string;
    }>;
  };
}

/** States that require operator attention — shown expanded. */
const ATTENTION_STATES = new Set([
  'under_review', 'shutting_down', 'restarting', 'disabled',
]);

/**
 * Motor card — adaptive display:
 * - Healthy/stopped: compact (code + badge + timestamp only)
 * - Anomalous states: expanded (full sensor values visible)
 *
 * Follows ISA-101: hierarchy by exception, not inventory.
 */
export const MotorCard = memo(function MotorCard({ motor }: MotorCardProps) {
  const navigate = useNavigate();
  const needsAttention = ATTENTION_STATES.has(motor.status);
  const lastUpdate = getLastUpdate(motor.sensors);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/motors/${motor.id}`);
    }
  }

  return (
    <div
      className={`motor-card ${needsAttention ? 'motor-card--attention' : 'motor-card--normal'}`}
      onClick={() => navigate(`/motors/${motor.id}`)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Ver detalle de ${motor.code}`}
    >
      <div className="card-header">
        <strong>{motor.code}</strong>
        <StatusBadge status={motor.status} />
      </div>

      {needsAttention && (
        <>
          <p className="card-name">{motor.name}</p>
          <p className="card-location">{motor.location}</p>
          <div className="card-sensors">
            {Object.values(motor.sensors).map((sensor) => (
              <span key={sensor.sensorType} className={`sensor-value ${sensor.status}`}>
                {sensor.sensorType[0].toUpperCase()}:{' '}
                {sensor.lastValue !== null ? sensor.lastValue.toFixed(1) : '—'}
              </span>
            ))}
          </div>
        </>
      )}

      {!needsAttention && (
        <p className="card-name">{motor.name}</p>
      )}

      <p className="card-timestamp">
        {lastUpdate ? `Último dato: ${lastUpdate}` : 'Sin datos'}
      </p>
    </div>
  );
});

/** Get the most recent lastReadingAt across all sensors, formatted as relative time. */
function getLastUpdate(
  sensors: Record<string, { lastReadingAt: string | null }>,
): string | null {
  let latest: Date | null = null;

  for (const sensor of Object.values(sensors)) {
    if (sensor.lastReadingAt) {
      const d = new Date(sensor.lastReadingAt);
      if (!latest || d > latest) latest = d;
    }
  }

  if (!latest) return null;

  const seconds = Math.floor((Date.now() - latest.getTime()) / 1000);
  if (seconds < 5) return 'ahora';
  if (seconds < 60) return `hace ${seconds}s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)}min`;
  return `hace ${Math.floor(seconds / 3600)}h`;
}
