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
    sensors: Record<string, { sensorType: string; lastValue: number | null; status: string }>;
  };
}

/**
 * Single motor card for the grid view.
 * Memoized to avoid re-rendering when other motors receive telemetry.
 */
export const MotorCard = memo(function MotorCard({ motor }: MotorCardProps) {
  const navigate = useNavigate();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/motors/${motor.id}`);
    }
  }

  return (
    <div
      className="motor-card"
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
    </div>
  );
});
