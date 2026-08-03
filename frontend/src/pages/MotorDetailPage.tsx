import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { joinMotorRoom, leaveMotorRoom } from '../store/socket.middleware';
import { clearConversation } from '../store/rag.slice';
import { fetchMotorDetail } from '../store/motors.slice';
import { api } from '../services/api';
import { StatusBadge } from '../components/motors/StatusBadge';
import { SensorChart } from '../components/motors/SensorChart';
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
  const dispatch = useDispatch<AppDispatch>();
  const motorId = Number(id);
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);
  const detailLoading = useSelector((state: RootState) => state.motors.detailLoading);
  const [cmdLoading, setCmdLoading] = useState(false);

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

  // Motor not in store yet (first navigation without prior dashboard load)
  if (!motor) {
    return (
      <div className="motor-detail">
        <div className="sensor-charts">
          <div className="chart-skeleton" aria-hidden="true" />
          <div className="chart-skeleton" aria-hidden="true" />
          <div className="chart-skeleton" aria-hidden="true" />
        </div>
      </div>
    );
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

      {detailLoading ? (
        <div className="sensor-charts">
          <div className="chart-skeleton" aria-hidden="true" />
          <div className="chart-skeleton" aria-hidden="true" />
          <div className="chart-skeleton" aria-hidden="true" />
        </div>
      ) : (
        <div className="sensor-charts">
          {Object.entries(motor.sensors).map(([type, sensor]) => (
            <SensorChart key={type} sensor={sensor} sensorType={type} />
          ))}
        </div>
      )}

      <RagQueryBox motorId={motorId} />
    </div>
  );
}

