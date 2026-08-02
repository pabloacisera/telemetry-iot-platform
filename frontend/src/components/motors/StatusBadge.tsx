interface StatusBadgeProps {
  status: string;
}

/** Visual badge mapping status → color for motors and sensors. */
const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  ok: '#22c55e',
  under_review: '#f59e0b',
  shutting_down: '#ef4444',
  restarting: '#3b82f6',
  disabled: '#6b7280',
  manual_shutdown: '#6b7280',
  fault: '#ef4444',
  fault_persistent: '#991b1b',
};

/**
 * Colored status badge — used in motor cards and sensor charts.
 * Maps status string to a color dot + label.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#9ca3af';

  return (
    <span className="status-badge" aria-label={`Status: ${status}`}>
      <span className="badge-dot" style={{ backgroundColor: color }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
