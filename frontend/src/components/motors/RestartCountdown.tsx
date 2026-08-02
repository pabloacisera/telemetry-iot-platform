import { useSelector } from 'react-redux';
import { RootState } from '../../store';

interface RestartCountdownProps {
  motorId: number;
}

/**
 * Displays a live countdown timer while a motor is restarting.
 * Reads secondsRemaining from the motorsSlice, updated by the
 * restart-progress WebSocket event.
 */
export function RestartCountdown({ motorId }: RestartCountdownProps) {
  const seconds = useSelector(
    (state: RootState) => state.motors.byId[motorId]?.restartSecondsRemaining,
  );

  if (seconds === null || seconds === undefined) return null;

  return (
    <div className="restart-countdown" role="status" aria-live="polite">
      <span className="countdown-label">Restarting...</span>
      <span className="countdown-value">{seconds}s</span>
    </div>
  );
}
