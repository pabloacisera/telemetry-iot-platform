import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { MotorCard } from './MotorCard';

/**
 * Grid view of all 15 motors.
 * Each card shows: code, location, status badge, last sensor values.
 */
export function MotorGrid() {
  const motors = useSelector((state: RootState) => state.motors.byId);

  return (
    <div className="motor-grid">
      {Object.values(motors).map((motor) => (
        <MotorCard key={motor.id} motor={motor} />
      ))}
    </div>
  );
}
