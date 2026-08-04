interface StatusBadgeProps {
  status: string;
}

/**
 * ISA-101 compliant color mapping:
 * - Normal states: neutral grays (don't compete with alarms)
 * - Alarm states only: saturated colors (immediate visual urgency)
 */
const STATUS_COLORS: Record<string, string> = {
  // Normal / operational — neutral
  healthy: '#22c55e',       // green (operating normally)
  ok: '#22c55e',            // green
  manual_shutdown: '#6b7280', // gray (intentional stop)

  // Alarm states — saturated
  under_review: '#f59e0b',  // amber (warning)
  shutting_down: '#ef4444', // red (critical action)
  restarting: '#3b82f6',    // blue (informational action)
  disabled: '#991b1b',      // dark red (requires intervention)
  fault: '#ef4444',         // red (sensor fault)
  fault_persistent: '#991b1b', // dark red (persistent fault)
};

/** Status labels in Spanish. */
const STATUS_LABELS: Record<string, string> = {
  healthy: 'Saludable',
  ok: 'Normal',
  under_review: 'En revisión',
  shutting_down: 'Deteniendo',
  restarting: 'Reiniciando',
  disabled: 'Deshabilitado',
  manual_shutdown: 'Parada manual',
  fault: 'Falla',
  fault_persistent: 'Falla persistente',
};

/** Status icons for accessibility (not only color). */
const STATUS_ICONS: Record<string, string> = {
  healthy: '●',
  ok: '●',
  under_review: '▲',
  shutting_down: '■',
  restarting: '↻',
  disabled: '✕',
  manual_shutdown: '⏸',
  fault: '⚠',
  fault_persistent: '⚠',
};

/**
 * Colored status badge — used in motor cards and sensor charts.
 * ISA-101: combines color + icon + text to not depend on color alone.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#9ca3af';
  const label = STATUS_LABELS[status] || status.replace(/_/g, ' ');
  const icon = STATUS_ICONS[status] || '●';

  return (
    <span className="status-badge" aria-label={`Estado: ${label}`}>
      <span className="badge-icon" style={{ color }} aria-hidden="true">{icon}</span>
      <span style={{ color }}>{label}</span>
    </span>
  );
}
