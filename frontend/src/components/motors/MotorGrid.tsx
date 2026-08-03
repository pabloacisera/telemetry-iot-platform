import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { MotorCard } from './MotorCard';

/**
 * Grid view of all motors.
 * Uses a stable list of motor IDs to avoid re-rendering the grid container
 * when individual motor data changes — only the affected MotorCard updates.
 */
export function MotorGrid() {
  const motorsById = useSelector((state: RootState) => state.motors.byId);
  const motorIds = useMemo(() => Object.keys(motorsById).map(Number), [motorsById]);

  return (
    <div className="motor-grid">
      {motorIds.map((id) => (
        <MotorCardWrapper key={id} motorId={id} />
      ))}
    </div>
  );
}

/** Wrapper that selects a single motor — isolates re-renders to the individual card. */
function MotorCardWrapper({ motorId }: { motorId: number }) {
  const motor = useSelector((state: RootState) => state.motors.byId[motorId]);
  if (!motor) return null;
  return <MotorCard motor={motor} />;
}
