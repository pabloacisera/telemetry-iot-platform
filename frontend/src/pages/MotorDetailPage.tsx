import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { joinMotorRoom, leaveMotorRoom } from '../store/socket.middleware';
import { clearConversation } from '../store/rag.slice';
import { fetchMotorDetail } from '../store/motors.slice';
import { api } from '../services/api';
import { StatusBadge } from '../components/motors/StatusBadge';
import { RestartCountdown } from '../components/motors/RestartCountdown';
import { RagQueryBox } from '../components/rag/RagQueryBox';
import { RoleGate } from '../components/routes/RoleGate';
import { LoadingSpinner } from '../components/LoadingSpinner';

const SensorChart = lazy(() =>
  import('../components/motors/SensorChart').then((m) => ({ default: m.SensorChart }))
);

/**
 * Motor detail page — shows 3 real-time charts (one per sensor).
 * Joins the motor's WebSocket room on mount, leaves on unmount.
 */
export function MotorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const motorId = Number(id);
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);
  const [cmdLoading, setCmdLoading] = useState(false);

  // Join/leave motor room for targeted WebSocket events
  useEffect(() => {
    dispatch(clearConversation());
    dispatch(fetchMotorDetail(motorId));
    dispatch(joinMotorRoom(motorId));
    return () => {
      dispatch(leaveMotorRoom(motorId));
    };
  }, [dispatch, motorId]);

  const handleStop = async () => {
    setCmdLoading(true);
    try {
      await api.post(`/motors/${motorId}/stop`);
    } catch {
      // silently fail
    }
    setCmdLoading(false);
  };

  const handleRestart = async () => {
    setCmdLoading(true);
    try {
      await api.post(`/motors/${motorId}/restart`);
    } catch {
      // silently fail
    }
    setCmdLoading(false);
  };

  if (!motor) {
    return <LoadingSpinner message="Cargando motor..." />;
  }

  const isRestarting = motor.status === 'restarting' || motor.status === 'shutting_down';
  const isStopped = motor.status === 'manual_shutdown';
  const canStop = !isRestarting && !isStopped && (motor.status === 'healthy' || motor.status === 'under_review');
  const canRestart = !isRestarting && (motor.status === 'under_review' || motor.status === 'manual_shutdown' || motor.status === 'disabled');

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
        {(motor.status === 'restarting' || motor.restartSecondsRemaining) && (
          <RestartCountdown motorId={motorId} />
        )}
      </header>

      <RoleGate minimumRole="operator">
        <div className="motor-controls">
          {isStopped ? (
            <button
              type="button"
              className="btn-restart"
              disabled={cmdLoading || isRestarting}
              onClick={handleRestart}
            >
              Arrancar
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </RoleGate>

      <Suspense fallback={<LoadingSpinner message="Cargando gráficos..." />}>
        <div className="sensor-charts">
          {Object.entries(motor.sensors).map(([type, sensor]) => (
            <SensorChart key={type} sensor={sensor} sensorType={type} />
          ))}
        </div>
      </Suspense>

      <RagQueryBox motorId={motorId} />
    </div>
  );
}
