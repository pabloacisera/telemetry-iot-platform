import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { MotorCard } from './MotorCard';

/** Priority order: states that need attention first. */
const STATUS_PRIORITY: Record<string, number> = {
  disabled: 0,
  under_review: 1,
  shutting_down: 2,
  restarting: 3,
  manual_shutdown: 4,
  healthy: 5,
};

/**
 * Grid view of all motors.
 * Sorted by priority: anomalous/critical states first, healthy last.
 * Uses per-motor selectors to isolate re-renders.
 */
export function MotorGrid() {
  const motorsById = useSelector((state: RootState) => state.motors.byId);

  const sortedIds = useMemo(() => {
    return Object.values(motorsById)
      .sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 5;
        const pb = STATUS_PRIORITY[b.status] ?? 5;
        if (pa !== pb) return pa - pb;
        return a.id - b.id;
      })
      .map((m) => m.id);
  }, [motorsById]);

  return (
    <div className="motor-grid">
      {sortedIds.map((id) => (
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
