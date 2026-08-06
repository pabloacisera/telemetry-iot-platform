import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertHistoryRow {
  id: number;
  motorId: number;
  motor: { id: number; code: string; name: string } | null;
  type: string;
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolvedByUser: { id: number; email: string } | null;
  resolutionNote: string | null;
}

interface Motor {
  id: number;
  code: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

const ALERT_LABELS: Record<string, string> = {
  warning: 'Advertencia',
  motor_alarm: 'Alarma de motor',
  motor_trip: 'Trip forzado',
  motor_disabled: 'Motor deshabilitado',
  forced_restart: 'Reinicio forzado',
  disabled: 'Deshabilitado',
  sensor_failure_widespread: 'Falla general de sensores',
};

const SENSOR_LABELS: Record<string, string> = {
  temperature: 'Temperatura',
  vibration: 'Vibración',
  current: 'Corriente',
};

const REASON_LABELS: Record<string, string> = {
  critical_reading: 'Lectura crítica',
  grace_timer_expired: 'Tiempo de gracia agotado',
  recurrence_after_restart: 'Recurrencia tras reinicio',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(from: string, to: string | null): string {
  if (!to) return 'En curso';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatCause(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  const parts: string[] = [];

  if (typeof metadata.triggerSensorType === 'string') {
    const label = SENSOR_LABELS[metadata.triggerSensorType] || metadata.triggerSensorType;
    const value = typeof metadata.triggerValue === 'number'
      ? `: ${metadata.triggerValue.toFixed(1)}`
      : '';
    parts.push(`${label}${value}`);
  }

  if (typeof metadata.consecutiveReadings === 'number') {
    parts.push(`${metadata.consecutiveReadings} consecutivas`);
  }

  if (typeof metadata.reason === 'string') {
    parts.push(REASON_LABELS[metadata.reason] || metadata.reason.replace(/_/g, ' '));
  }

  return parts.length > 0 ? parts.join(' · ') : '—';
}

function formatResolution(row: AlertHistoryRow): string {
  if (!row.resolvedAt) return '—';
  if (row.resolvedBy !== null) {
    return `Humana${row.resolvedByUser ? ` (${row.resolvedByUser.email})` : ''}`;
  }
  return 'Automática';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AlertHistoryPage() {
  const navigate = useNavigate();

  // ── Data ──
  const [alerts, setAlerts] = useState<AlertHistoryRow[]>([]);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ──
  const [filterMotorId, setFilterMotorId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'resolved'>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // ── Pagination ──
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const [alertsRes, motorsRes] = await Promise.all([
          api.get('/alerts/history?limit=200'),
          api.get('/config/motors'),
        ]);
        setAlerts(alertsRes.data.data);
        setMotors(motorsRes.data);
      } catch {
        setError('Error al cargar el historial de alertas');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // ── Apply filters (client-side) ──
  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterMotorId && a.motorId !== parseInt(filterMotorId)) return false;

      if (filterStatus === 'active' && a.resolvedAt !== null) return false;
      if (filterStatus === 'resolved' && a.resolvedAt === null) return false;

      if (filterFrom) {
        const from = new Date(filterFrom);
        if (new Date(a.triggeredAt) < from) return false;
      }
      if (filterTo) {
        // Include the full day selected in "to"
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(a.triggeredAt) > to) return false;
      }

      return true;
    });
  }, [alerts, filterMotorId, filterStatus, filterFrom, filterTo]);

  // Reset to page 0 whenever filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function clearFilters() {
    setFilterMotorId('');
    setFilterStatus('all');
    setFilterFrom('');
    setFilterTo('');
    setPage(0);
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="alert-history-page">
        <div className="config-skeleton-header" />
        <div className="config-skeleton-tabs" />
        <div className="config-skeleton-list">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="config-skeleton-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="alert-history-page">
      <header className="config-header">
        <button type="button" className="back-button" onClick={() => navigate('/dashboard')}>
          <i className="fa-solid fa-arrow-left" /> Volver
        </button>
        <h1>Historial de Alertas</h1>
        <span className="alert-history-total">{filtered.length} alertas</span>
      </header>

      {error && <p className="config-error">{error}</p>}

      {/* ── Filtros ── */}
      <div className="alert-history-filters">
        <label className="alert-history-filter-field">
          <span>Motor</span>
          <select value={filterMotorId} onChange={(e) => { setFilterMotorId(e.target.value); setPage(0); }}>
            <option value="">Todos</option>
            {motors.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.code} — {m.name}</option>
            ))}
          </select>
        </label>

        <label className="alert-history-filter-field">
          <span>Estado</span>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as 'all' | 'active' | 'resolved'); setPage(0); }}>
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="resolved">Resueltas</option>
          </select>
        </label>

        <label className="alert-history-filter-field">
          <span>Desde</span>
          <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }} />
        </label>

        <label className="alert-history-filter-field">
          <span>Hasta</span>
          <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(0); }} />
        </label>

        <button type="button" className="btn-cancel alert-history-clear" onClick={clearFilters}>
          <i className="fa-solid fa-xmark" /> Limpiar
        </button>
      </div>

      {/* ── Tabla dentro del wrapper del dashboard ── */}
      <div className="dashboard-grid-container alert-history-wrapper">
        {filtered.length === 0 ? (
          <p className="config-empty-state">No hay alertas que coincidan con los filtros.</p>
        ) : (
          <>
            <div className="alert-history-table-scroll">
              <table className="alert-history-table">
                <thead>
                  <tr>
                    <th>Motor</th>
                    <th>Tipo</th>
                    <th>Causa</th>
                    <th>Disparada</th>
                    <th>Resuelta</th>
                    <th>Duración</th>
                    <th>Resolución</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a) => (
                    <tr key={a.id}>
                      <td className="alert-history-motor">
                        <strong>{a.motor?.code ?? `Motor ${a.motorId}`}</strong>
                        <span>{a.motor?.name}</span>
                      </td>
                      <td>{ALERT_LABELS[a.type] || a.type.replace(/_/g, ' ')}</td>
                      <td className="alert-history-cause">{formatCause(a.metadata)}</td>
                      <td className="alert-history-datetime">{formatDateTime(a.triggeredAt)}</td>
                      <td className="alert-history-datetime">
                        {a.resolvedAt ? formatDateTime(a.resolvedAt) : '—'}
                      </td>
                      <td className="alert-history-duration">
                        {formatDuration(a.triggeredAt, a.resolvedAt)}
                      </td>
                      <td className="alert-history-resolution">
                        {formatResolution(a)}
                      </td>
                      <td>
                        {a.resolvedAt
                          ? <span className="alert-history-badge alert-history-badge--resolved">Resuelta</span>
                          : <span className="alert-history-badge alert-history-badge--active">Activa</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Paginación ── */}
            <div className="config-pagination">
              <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span>{safePage + 1} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
