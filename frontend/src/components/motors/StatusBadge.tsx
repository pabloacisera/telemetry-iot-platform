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
  alarm: '#f97316',         // orange (alarm — operator attention needed)
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
  alarm: 'Alarma',
  under_review: 'En revisión',
  shutting_down: 'Deteniendo',
  restarting: 'Reiniciando',
  disabled: 'Deshabilitado',
  manual_shutdown: 'Parada manual',
  fault: 'Falla',
  fault_persistent: 'Falla persistente',
};

/** FontAwesome icon classes per status — professional and clear. */
const STATUS_ICONS: Record<string, string> = {
  healthy: 'fa-solid fa-circle-check',
  ok: 'fa-solid fa-circle-check',
  alarm: 'fa-solid fa-triangle-exclamation',
  under_review: 'fa-solid fa-triangle-exclamation',
  shutting_down: 'fa-solid fa-stop',
  restarting: 'fa-solid fa-rotate',
  disabled: 'fa-solid fa-circle-xmark',
  manual_shutdown: 'fa-solid fa-pause',
  fault: 'fa-solid fa-bolt',
  fault_persistent: 'fa-solid fa-bolt',
};

/**
 * Colored status badge — used in motor cards and sensor charts.
 * ISA-101: combines color + icon + text to not depend on color alone.
 * Uses FontAwesome icons via CDN.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#9ca3af';
  const label = STATUS_LABELS[status] || status.replace(/_/g, ' ');
  const iconClass = STATUS_ICONS[status] || 'fa-solid fa-circle';

  return (
    <span className="status-badge" aria-label={`Estado: ${label}`}>
      <i className={`badge-icon ${iconClass}`} style={{ color }} aria-hidden="true" />
      <span style={{ color }}>{label}</span>
    </span>
  );
}
