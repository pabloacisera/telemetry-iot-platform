import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { joinMotorRoom, leaveMotorRoom } from '../store/socket.middleware';
import { api } from '../services/api';
import { SensorChart } from '../components/motors/SensorChart';
import { StatusBadge } from '../components/motors/StatusBadge';
import { RestartCountdown } from '../components/motors/RestartCountdown';
import { RagQueryBox } from '../components/rag/RagQueryBox';
import { RoleGate } from '../components/routes/RoleGate';

/**
 * Motor detail page — shows 3 real-time charts (one per sensor).
 * Joins the motor's WebSocket room on mount, leaves on unmount.
 */
export function MotorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const motorId = Number(id);
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdMessage, setCmdMessage] = useState<string | null>(null);

  // Join/leave motor room for targeted WebSocket events
  useEffect(() => {
    dispatch(joinMotorRoom(motorId));
    return () => {
      dispatch(leaveMotorRoom(motorId));
    };
  }, [dispatch, motorId]);

  const handleStop = async () => {
    setCmdLoading(true);
    setCmdMessage(null);
    try {
      const res = await api.post(`/motors/${motorId}/stop`);
      setCmdMessage(res.data.message);
    } catch {
      setCmdMessage('Error al enviar comando de detención');
    }
    setCmdLoading(false);
  };

  const handleRestart = async () => {
    setCmdLoading(true);
    setCmdMessage(null);
    try {
      const res = await api.post(`/motors/${motorId}/restart`);
      setCmdMessage(res.data.message);
    } catch {
      setCmdMessage('Error al enviar comando de reinicio');
    }
    setCmdLoading(false);
  };

  if (!motor) {
    return <p>Motor no encontrado</p>;
  }

  const canStop = motor.status === 'healthy' || motor.status === 'under_review';
  const canRestart = motor.status === 'under_review' || motor.status === 'manual_shutdown' || motor.status === 'disabled';

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
          <button
            type="button"
            className="btn-stop"
            disabled={!canStop || cmdLoading}
            onClick={handleStop}
          >
            Detener
          </button>
          <button
            type="button"
            className="btn-restart"
            disabled={!canRestart || cmdLoading}
            onClick={handleRestart}
          >
            Reiniciar
          </button>
        </div>
        {cmdMessage && <p className="cmd-feedback">{cmdMessage}</p>}
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
