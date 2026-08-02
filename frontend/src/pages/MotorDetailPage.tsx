import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { SensorChart } from '../components/motors/SensorChart';
import { StatusBadge } from '../components/motors/StatusBadge';
import { RestartCountdown } from '../components/motors/RestartCountdown';
import { RagQueryBox } from '../components/rag/RagQueryBox';
import { RoleGate } from '../components/routes/RoleGate';

/**
 * Motor detail page — shows 3 real-time charts (one per sensor).
 * Each chart has its own independent status badge (ok/fault).
 * During 'restarting', shows the countdown timer.
 * Provides stop/restart controls for admin/operator roles.
 */
export function MotorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const motorId = Number(id);
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);

  if (!motor) {
    return <p>Motor no encontrado</p>;
  }

  return (
    <div className="motor-detail">
      <header className="motor-detail-header">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/dashboard')}
          aria-label="Volver al panel"
        >
          &larr; Volver
        </button>
        <h1>{motor.code} — {motor.name}</h1>
        <StatusBadge status={motor.status} />
        <p>{motor.location}</p>
        {motor.status === 'restarting' && (
          <RestartCountdown motorId={motorId} />
        )}
      </header>

      <RoleGate minimumRole="operator">
        <div className="motor-controls">
          <button type="button" className="btn-stop" disabled>
            Detener
          </button>
          <button type="button" className="btn-restart" disabled>
            Reiniciar
          </button>
        </div>
      </RoleGate>

      <div className="sensor-charts">
        {Object.entries(motor.sensors).map(([type, sensor]) => (
          <SensorChart key={type} sensor={sensor} sensorType={type} />
        ))}
      </div>

      <RagQueryBox motorId={motorId} />
    </div>
  );
}
