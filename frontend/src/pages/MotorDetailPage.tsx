import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { SensorChart } from '../components/motors/SensorChart';
import { StatusBadge } from '../components/motors/StatusBadge';

/**
 * Motor detail page — shows 3 real-time charts (one per sensor).
 * Each chart has its own independent status badge (ok/fault).
 * During 'restarting', shows the countdown timer.
 */
export function MotorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const motorId = Number(id);
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);

  if (!motor) {
    return <p>Motor not found</p>;
  }

  return (
    <div className="motor-detail">
      <header>
        <h1>{motor.code} — {motor.name}</h1>
        <StatusBadge status={motor.status} />
        <p>{motor.location}</p>
      </header>

      <div className="sensor-charts">
        {Object.entries(motor.sensors).map(([type, sensor]) => (
          <SensorChart key={type} sensor={sensor} sensorType={type} />
        ))}
      </div>
    </div>
  );
}
