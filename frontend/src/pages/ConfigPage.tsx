import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { invalidateMotors } from '../store/motors.slice';
import { api } from '../services/api';
import type { AxiosError } from 'axios';
import { StatusBadge } from '../components/motors/StatusBadge';

interface Motor {
  id: number;
  code: string;
  name: string;
  location: string | null;
  connectionType: string;
  ratedCurrentA: number;
  insulationClass: string;
  alarmConsecutiveReadings: number;
  alarmGracePeriodMs: number;
  postRestartCooldownMs: number;
  maxAutoRestarts: number;
  status: string;
  sensors: Sensor[];
}

interface Sensor {
  id: number;
  sensorType: string;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
  status: string;
}

interface SensorStandard {
  id: number;
  sensorType: string;
  standardName: string;
  unit: string;
  defaultHealthyMax: number;
  defaultWarningMax: number;
  defaultCriticalMax: number;
  sourceReference: string;
}

interface AlertConfig {
  alarmConsecutiveReadings: number;
  alarmGracePeriodMs: number;
  postRestartCooldownMs: number;
  maxAutoRestarts: number;
}

interface AlertOverride {
  id: number;
  motorId: number;
  alarmConsecutiveReadings: number;
  alarmGracePeriodMs: number;
  postRestartCooldownMs: number;
  maxAutoRestarts: number;
  motor: { id: number; code: string; name: string };
}

type Tab = 'motors' | 'sensors' | 'alerts';

/** Effective default thresholds for a sensor type on a given motor.
 * Current thresholds are multipliers of rated current; other sensor types
 * use the global standard values directly. Mirrors the backend logic. */
function effectiveThresholds(std: SensorStandard, ratedCurrentA: number): { healthyMax: number; warningMax: number; criticalMax: number } {
  if (std.sensorType === 'current') {
    return {
      healthyMax: Math.round(ratedCurrentA * std.defaultHealthyMax * 100) / 100,
      warningMax: Math.round(ratedCurrentA * std.defaultWarningMax * 100) / 100,
      criticalMax: Math.round(ratedCurrentA * std.defaultCriticalMax * 100) / 100,
    };
  }
  return {
    healthyMax: std.defaultHealthyMax,
    warningMax: std.defaultWarningMax,
    criticalMax: std.defaultCriticalMax,
  };
}

const STATUS_PRIORITY: Record<string, number> = {
  disabled: 0,
  alarm: 1,
  shutting_down: 2,
  under_review: 3,
  restarting: 4,
  manual_shutdown: 5,
  healthy: 6,
};

export function ConfigPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const userRole = useSelector((state: RootState) => state.auth.user?.role);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [standards, setStandards] = useState<SensorStandard[]>([]);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [overrides, setOverrides] = useState<AlertOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('motors');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMotorId, setEditingMotorId] = useState<number | null>(null);
  const [editingThresholds, setEditingThresholds] = useState<{ motorId: number; sensor: Sensor } | null>(null);
  const [editingOverride, setEditingOverride] = useState<{ motorId?: number; override?: AlertOverride } | null>(null);
  const [mqttCredentials, setMqttCredentials] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (userRole && userRole !== 'admin') {
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  useEffect(() => {
    return () => {
      if (dirty) dispatch(invalidateMotors());
    };
  }, [dirty, dispatch]);

  const fetchAll = useCallback(async () => {
    try {
      const [motorsRes, standardsRes, alertRes, overridesRes] = await Promise.all([
        api.get('/config/motors'),
        api.get('/config/standards'),
        api.get('/config/alerts'),
        api.get('/config/alerts/overrides'),
      ]);
      setMotors(motorsRes.data);
      setStandards(standardsRes.data);
      setAlertConfig(alertRes.data);
      setOverrides(overridesRes.data);
    } catch {
      setError('Error al cargar configuracion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await fetchAll(); };
    void load();
  }, [fetchAll]);

  const sortedMotors = [...motors].sort((a, b) =>
    (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
  );

  if (loading) {
    return (
      <div className="config-page">
        <div className="config-skeleton-header" />
        <div className="config-skeleton-tabs" />
        <div className="config-skeleton-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="config-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <button type="button" className="back-button" onClick={() => { if (dirty) dispatch(invalidateMotors()); navigate('/dashboard'); }}>
          <i className="fa-solid fa-arrow-left" /> Volver
        </button>
        <h1>Configuracion</h1>
      </header>

      {error && <p className="config-error">{error}</p>}

      {mqttCredentials && (
        <MqttCredentialsAlert credentials={mqttCredentials} onDismiss={() => setMqttCredentials(null)} />
      )}

      <nav className="config-tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'motors'} className={`config-tab ${activeTab === 'motors' ? 'config-tab--active' : ''}`} onClick={() => setActiveTab('motors')}>
          <i className="fa-solid fa-gear" /> Motores
        </button>
        <button role="tab" aria-selected={activeTab === 'sensors'} className={`config-tab ${activeTab === 'sensors' ? 'config-tab--active' : ''}`} onClick={() => setActiveTab('sensors')}>
          <i className="fa-solid fa-wave-square" /> Sensores
        </button>
        <button role="tab" aria-selected={activeTab === 'alerts'} className={`config-tab ${activeTab === 'alerts' ? 'config-tab--active' : ''}`} onClick={() => setActiveTab('alerts')}>
          <i className="fa-solid fa-triangle-exclamation" /> Alertas
        </button>
      </nav>

      <div className="config-tab-content">
        {activeTab === 'motors' && (
          <MotorsTab
            motors={sortedMotors}
            onEdit={(m) => setEditingMotorId(m.id)}
            onDelete={handleDelete}
            onCreate={() => setShowCreateForm(true)}
            onEditThresholds={(motorId, sensor) => setEditingThresholds({ motorId, sensor })}
          />
        )}
        {activeTab === 'sensors' && (
          <SensorsTab motors={motors} standards={standards} onStandardUpdated={fetchAll} />
        )}
        {activeTab === 'alerts' && (
          <AlertsTab
            motors={motors}
            alertConfig={alertConfig}
            overrides={overrides}
            onEditOverride={(o) => setEditingOverride({ motorId: o.motorId, override: o })}
            onDeleteOverride={handleDeleteOverride}
            onEditGlobalConfig={handleUpdateGlobalConfig}
          />
        )}
      </div>

      {showCreateForm && (
        <CreateMotorForm
          onCreated={(result) => { setShowCreateForm(false); setMqttCredentials(result.mqtt); setDirty(true); fetchAll(); }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingMotorId !== null && (
        <EditMotorModal
          motor={motors.find((m) => m.id === editingMotorId)!}
          onSaved={() => { setEditingMotorId(null); setDirty(true); fetchAll(); }}
          onCancel={() => setEditingMotorId(null)}
        />
      )}

      {editingThresholds && (
        <EditThresholdsModal
          motorId={editingThresholds.motorId}
          sensor={editingThresholds.sensor}
          standard={standards.find((s) => s.sensorType === editingThresholds.sensor.sensorType)}
          ratedCurrentA={motors.find((m) => m.id === editingThresholds.motorId)?.ratedCurrentA}
          onSaved={() => { setEditingThresholds(null); setDirty(true); fetchAll(); }}
          onCancel={() => setEditingThresholds(null)}
        />
      )}

      {editingOverride && (
        <EditOverrideModal
          motorId={editingOverride.motorId}
          existingOverride={editingOverride.override}
          motors={motors}
          existingOverrides={overrides}
          onSaved={() => { setEditingOverride(null); setDirty(true); fetchAll(); }}
          onCancel={() => setEditingOverride(null)}
        />
      )}
    </div>
  );

  async function handleDelete(motor: Motor) {
    if (!window.confirm(`Eliminar motor ${motor.code}? Eliminara sus credenciales MQTT.`)) return;
    try {
      await api.delete(`/config/motors/${motor.id}`);
      setDirty(true);
      fetchAll();
    } catch {
      setError(`Error al eliminar motor ${motor.code}`);
    }
  }

  async function handleDeleteOverride(motorId: number) {
    if (!window.confirm('Eliminar regla personalizada? El motor volvera a la config global.')) return;
    try {
      await api.delete(`/config/alerts/overrides/${motorId}`);
      setDirty(true);
      fetchAll();
    } catch {
      setError('Error al eliminar override');
    }
  }

  async function handleUpdateGlobalConfig(config: AlertConfig) {
    try {
      await api.patch('/config/alerts', config);
      setDirty(true);
      fetchAll();
    } catch {
      setError('Error al guardar config global');
    }
  }
}

// ─── Tab: Motors ──────────────────────────────────────────────────────────────

function MotorsTab({ motors, onEdit, onDelete, onCreate, onEditThresholds }: {
  motors: Motor[];
  onEdit: (m: Motor) => void;
  onDelete: (m: Motor) => void;
  onCreate: () => void;
  onEditThresholds: (motorId: number, sensor: Sensor) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="config-tab-wrapper">
      <div className="config-tab-header">
        <span className="config-tab-count">{motors.length} motores</span>
        <button type="button" className="btn-create" onClick={onCreate}>
          <i className="fa-solid fa-plus" /> Nuevo Motor
        </button>
      </div>
      <div className="config-motor-list">
        {motors.map((motor) => (
          <div
            key={motor.id}
            className={`config-motor-item ${motor.status !== 'healthy' ? 'config-motor-item--attention' : ''}`}
          >
            {/* Row siempre visible — clic colapsa/expande */}
            <div
              className="config-motor-row config-motor-row--collapsible"
              role="button"
              tabIndex={0}
              aria-expanded={expandedId === motor.id}
              onClick={() => setExpandedId(expandedId === motor.id ? null : motor.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expandedId === motor.id ? null : motor.id); } }}
            >
              <i className={`fa-solid ${expandedId === motor.id ? 'fa-chevron-down' : 'fa-chevron-right'} config-motor-chevron`} />
              <StatusBadge status={motor.status} />
              <strong className="config-motor-code">{motor.code}</strong>
              <span className="config-motor-name">{motor.name}</span>
              <span className="config-motor-location">{motor.location || '—'}</span>
              <span className="config-motor-conn">{motor.connectionType === 'lan' ? 'LAN' : 'WiFi'}</span>
              <div
                className="config-motor-actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => onEdit(motor)}
                  aria-label={`Editar ${motor.code}`}
                >
                  <i className="fa-solid fa-pen" />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon--danger"
                  onClick={() => onDelete(motor)}
                  aria-label={`Eliminar ${motor.code}`}
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>

            {/* Cuerpo retráctil — sensores */}
            {expandedId === motor.id && (
              <div className="config-sensors">
                {motor.sensors.map((sensor) => (
                  <button
                    key={sensor.id}
                    type="button"
                    className="config-sensor-chip"
                    onClick={() => onEditThresholds(motor.id, sensor)}
                  >
                    {sensor.sensorType}: {sensor.healthyMax}/{sensor.warningMax}/{sensor.criticalMax}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Sensors (3 sections) ───────────────────────────────────────────────

function SensorsTab({ motors, standards, onStandardUpdated }: {
  motors: Motor[];
  standards: SensorStandard[];
  onStandardUpdated: () => void;
}) {
  // ── Sección 1: edición de standards globales ──
  const [standardForms, setStandardForms] = useState<Record<number, { defaultHealthyMax: string; defaultWarningMax: string; defaultCriticalMax: string }>>(
    () => Object.fromEntries(
      standards.map((s) => [s.id, {
        defaultHealthyMax: String(s.defaultHealthyMax),
        defaultWarningMax: String(s.defaultWarningMax),
        defaultCriticalMax: String(s.defaultCriticalMax),
      }])
    )
  );
  const [savingStandardId, setSavingStandardId] = useState<number | null>(null);
  const [standardErrors, setStandardErrors] = useState<Record<number, string>>({});
  const [standardSuccess, setStandardSuccess] = useState<number | null>(null);

  // ── Sección 2/3: regla personalizada ──
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingSensor, setEditingSensor] = useState<{ motorId: number; sensor: Sensor } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteOverride(motorId: number, sensorId: number) {
    if (!window.confirm('Restaurar los umbrales de este sensor a los valores por defecto? Esta regla personalizada se eliminara.')) return;
    setDeleteError(null);
    try {
      await api.delete(`/config/motors/${motorId}/sensors/${sensorId}/thresholds`);
      onStandardUpdated();
    } catch {
      setDeleteError('Error al restaurar los umbrales del sensor');
    }
  }

  // ── Sección 3: paginación de tabla ──
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);

  // Derivar "reglas personalizadas" de sensores: todos los motores × sensores
  // que difieran de los valores efectivos del standard global de su tipo.
  // Para corriente el standard es un multiplicador de la corriente nominal.
  const sensorOverrides: { motor: Motor; sensor: Sensor; standard: SensorStandard; effective: { healthyMax: number; warningMax: number; criticalMax: number } }[] = [];
  for (const motor of motors) {
    for (const sensor of motor.sensors) {
      const std = standards.find((s) => s.sensorType === sensor.sensorType);
      if (!std) continue;
      const effective = effectiveThresholds(std, motor.ratedCurrentA);
      const isDifferent =
        sensor.healthyMax !== effective.healthyMax ||
        sensor.warningMax !== effective.warningMax ||
        sensor.criticalMax !== effective.criticalMax;
      if (isDifferent) sensorOverrides.push({ motor, sensor, standard: std, effective });
    }
  }

  const totalPages = Math.max(1, Math.ceil(sensorOverrides.length / PAGE_SIZE));
  const pagedOverrides = sensorOverrides.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sensorLabels: Record<string, string> = { temperature: 'Temperatura', vibration: 'Vibración', current: 'Corriente' };
  const sensorIcons: Record<string, string> = { temperature: 'fa-temperature-half', vibration: 'fa-wave-square', current: 'fa-bolt' };

  async function handleSaveStandard(std: SensorStandard) {
    const form = standardForms[std.id];
    setSavingStandardId(std.id);
    setStandardErrors((prev) => ({ ...prev, [std.id]: '' }));
    try {
      await api.patch(`/config/standards/${std.id}`, {
        defaultHealthyMax: parseFloat(form.defaultHealthyMax),
        defaultWarningMax: parseFloat(form.defaultWarningMax),
        defaultCriticalMax: parseFloat(form.defaultCriticalMax),
      });
      setStandardSuccess(std.id);
      setTimeout(() => setStandardSuccess(null), 2000);
      onStandardUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al guardar';
      setStandardErrors((prev) => ({ ...prev, [std.id]: msg }));
    } finally {
      setSavingStandardId(null);
    }
  }

  return (
    <div className="config-tab-wrapper">

      {/* ── Sección 1: Configuración global de sensores ── */}
      <section className="config-section-block">
        <h3 className="config-section-block-title">
          <i className="fa-solid fa-sliders" /> Umbrales globales por defecto
        </h3>
        <p className="config-section-desc">
          Valores de referencia usados al crear nuevos motores. Modificarlos no afecta motores existentes.
        </p>
        <div className="config-standards-grid">
          {standards.map((std) => {
            const form = standardForms[std.id] ?? {
              defaultHealthyMax: String(std.defaultHealthyMax),
              defaultWarningMax: String(std.defaultWarningMax),
              defaultCriticalMax: String(std.defaultCriticalMax),
            };
            return (
              <div key={std.id} className="config-standard-card">
                <div className="config-standard-card-header">
                  <i className={`fa-solid ${sensorIcons[std.sensorType] || 'fa-microchip'}`} />
                  <div>
                    <strong>{sensorLabels[std.sensorType] || std.sensorType}</strong>
                    <span className="config-standard-unit">{std.unit}</span>
                  </div>
                  <span className="config-standard-ref-name">{std.standardName}</span>
                </div>
                <div className="config-standard-fields">
                  <div className="config-sensor-edit-field">
                    <label>Saludable</label>
                    <input
                      type="number" step="0.1"
                      value={form.defaultHealthyMax}
                      onChange={(e) => setStandardForms((prev) => ({ ...prev, [std.id]: { ...form, defaultHealthyMax: e.target.value } }))}
                    />
                  </div>
                  <div className="config-sensor-edit-field">
                    <label>Advertencia</label>
                    <input
                      type="number" step="0.1"
                      value={form.defaultWarningMax}
                      onChange={(e) => setStandardForms((prev) => ({ ...prev, [std.id]: { ...form, defaultWarningMax: e.target.value } }))}
                    />
                  </div>
                  <div className="config-sensor-edit-field">
                    <label>Crítico</label>
                    <input
                      type="number" step="0.1"
                      value={form.defaultCriticalMax}
                      onChange={(e) => setStandardForms((prev) => ({ ...prev, [std.id]: { ...form, defaultCriticalMax: e.target.value } }))}
                    />
                  </div>
                </div>
                {standardErrors[std.id] && (
                  <p className="config-error config-standard-error">{standardErrors[std.id]}</p>
                )}
                <button
                  type="button"
                  className={`btn-create config-standard-save ${standardSuccess === std.id ? 'btn-create--success' : ''}`}
                  disabled={savingStandardId === std.id}
                  onClick={() => handleSaveStandard(std)}
                >
                  <i className={`fa-solid ${standardSuccess === std.id ? 'fa-check' : 'fa-save'}`} />
                  {savingStandardId === std.id ? 'Guardando...' : standardSuccess === std.id ? 'Guardado' : 'Guardar'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Sección 2: Botón regla personalizada ── */}
      <section className="config-section-block config-section-block--action">
        <div className="config-custom-rule-row">
          <div>
            <h3 className="config-section-block-title">
              <i className="fa-solid fa-code-branch" /> Regla personalizada
            </h3>
            <p className="config-section-desc">
              Asigna umbrales específicos a un motor concreto, sobreescribiendo los valores globales.
            </p>
          </div>
          <button type="button" className="btn-create" onClick={() => setShowOverrideModal(true)}>
            <i className="fa-solid fa-plus" /> Regla personalizada
          </button>
        </div>
      </section>

      {/* ── Sección 3: Tabla de reglas personalizadas ── */}
      <section className="config-section-block">
        <h3 className="config-section-block-title">
          <i className="fa-solid fa-table-list" /> Reglas activas ({sensorOverrides.length})
        </h3>
        {sensorOverrides.length === 0 ? (
          <p className="config-empty-state">
            No hay reglas personalizadas. Todos los motores usan los valores globales.
          </p>
        ) : (
          <>
            {deleteError && <p className="config-error">{deleteError}</p>}
            <table className="config-alert-table">
              <thead>
                <tr>
                  <th>Motor</th>
                  <th>Sensor</th>
                  <th>Saludable</th>
                  <th>Advertencia</th>
                  <th>Crítico</th>
                  <th>Referencia global</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedOverrides.map(({ motor, sensor, standard, effective }) => (
                  <tr key={sensor.id}>
                    <td><strong>{motor.code}</strong> <span>{motor.name}</span></td>
                    <td>
                      <span className="config-sensor-type-cell">
                        <i className={`fa-solid ${sensorIcons[sensor.sensorType] || 'fa-microchip'}`} />
                        {sensorLabels[sensor.sensorType] || sensor.sensorType}
                      </span>
                    </td>
                    <td>{sensor.healthyMax}</td>
                    <td>{sensor.warningMax}</td>
                    <td>{sensor.criticalMax}</td>
                    <td className="config-table-ref">
                      {effective.healthyMax}/{effective.warningMax}/{effective.criticalMax} {standard.unit}
                    </td>
                    <td className="config-table-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setEditingSensor({ motorId: motor.id, sensor })}
                        aria-label={`Editar umbrales de ${sensor.sensorType} en ${motor.code}`}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        onClick={() => handleDeleteOverride(motor.id, sensor.id)}
                        aria-label={`Eliminar regla de ${sensor.sensorType} en ${motor.code}`}
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="config-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <span>{page + 1} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modal: nueva regla personalizada */}
      {showOverrideModal && (
        <SensorOverrideModal
          motors={motors}
          standards={standards}
          onSaved={() => { setShowOverrideModal(false); onStandardUpdated(); }}
          onCancel={() => setShowOverrideModal(false)}
        />
      )}

      {/* Modal: editar regla existente */}
      {editingSensor && (
        <EditThresholdsModal
          motorId={editingSensor.motorId}
          sensor={editingSensor.sensor}
          standard={standards.find((s) => s.sensorType === editingSensor.sensor.sensorType)}
          ratedCurrentA={motors.find((m) => m.id === editingSensor.motorId)?.ratedCurrentA}
          onSaved={() => { setEditingSensor(null); onStandardUpdated(); }}
          onCancel={() => setEditingSensor(null)}
        />
      )}
    </div>
  );
}

/** Modal para asignar umbrales personalizados a un motor (nueva regla). */
function SensorOverrideModal({ motors, standards, onSaved, onCancel }: {
  motors: Motor[];
  standards: SensorStandard[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [selectedMotorId, setSelectedMotorId] = useState(motors[0]?.id ?? 0);
  const [selectedSensorType, setSelectedSensorType] = useState(standards[0]?.sensorType ?? '');

  const selectedMotor = motors.find((m) => m.id === selectedMotorId);
  const sensor = selectedMotor?.sensors.find((s) => s.sensorType === selectedSensorType);
  const standard = standards.find((s) => s.sensorType === selectedSensorType);

  if (!sensor || !standard) return null;

  return (
    <EditThresholdsModal
      motorId={selectedMotorId}
      sensor={sensor}
      standard={standard}
      ratedCurrentA={selectedMotor?.ratedCurrentA}
      extraHeader={
        <div className="config-form-grid" style={{ marginBottom: '1rem' }}>
          <label>Motor
            <select value={selectedMotorId} onChange={(e) => setSelectedMotorId(parseInt(e.target.value))}>
              {motors.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
          </label>
          <label>Sensor
            <select value={selectedSensorType} onChange={(e) => setSelectedSensorType(e.target.value)}>
              {standards.map((s) => (
                <option key={s.id} value={s.sensorType}>{s.sensorType}</option>
              ))}
            </select>
          </label>
        </div>
      }
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

// ─── Tab: Alerts (3 sections) ────────────────────────────────────────────────

function AlertsTab({ motors, alertConfig, overrides, onEditOverride, onDeleteOverride, onEditGlobalConfig }: {
  motors: Motor[];
  alertConfig: AlertConfig | null;
  overrides: AlertOverride[];
  onEditOverride: (override: AlertOverride) => void;
  onDeleteOverride: (motorId: number) => void;
  onEditGlobalConfig: (config: AlertConfig) => void;
}) {
  const [editForm, setEditForm] = useState<AlertConfig | null>(alertConfig);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(overrides.length / PAGE_SIZE));
  const pagedOverrides = overrides.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Estado para el modal de nueva regla personalizada
  const [showNewOverride, setShowNewOverride] = useState(false);

  // Mantiene editForm sincronizado cuando cambia alertConfig (patrón
  // "adjust state during render" en lugar de useEffect + setState).
  const [prevAlertConfig, setPrevAlertConfig] = useState(alertConfig);
  if (prevAlertConfig !== alertConfig) {
    setPrevAlertConfig(alertConfig);
    setEditForm(alertConfig);
  }

  if (!editForm) return null;

  async function handleSaveGlobal() {
    setSaving(true);
    await onEditGlobalConfig(editForm!);
    setSaving(false);
  }

  return (
    <div className="config-tab-wrapper">

      {/* ── Sección 1: Formulario config global ── */}
      <section className="config-section-block">
        <h3 className="config-section-block-title">
          <i className="fa-solid fa-globe" /> Configuración global
        </h3>
        <p className="config-section-desc">
          Aplica a todos los motores salvo que tengan una regla personalizada.
        </p>
        <div className="config-alert-global-grid">
          <label>Lecturas consecutivas para alarma
            <input
              type="number" min="1"
              value={editForm.alarmConsecutiveReadings}
              onChange={(e) => setEditForm({ ...editForm, alarmConsecutiveReadings: parseInt(e.target.value) || 1 })}
            />
            <span className="config-field-hint">Lecturas anómalas seguidas antes de alarma (default: 5)</span>
          </label>
          <label>Periodo de gracia (ms)
            <input
              type="number" min="5000" step="1000"
              value={editForm.alarmGracePeriodMs}
              onChange={(e) => setEditForm({ ...editForm, alarmGracePeriodMs: parseInt(e.target.value) || 5000 })}
            />
            <span className="config-field-hint">Tiempo antes de auto-trip (default: 120000 = 2min)</span>
          </label>
          <label>Cooldown post-reinicio (ms)
            <input
              type="number" min="10000" step="1000"
              value={editForm.postRestartCooldownMs}
              onChange={(e) => setEditForm({ ...editForm, postRestartCooldownMs: parseInt(e.target.value) || 10000 })}
            />
            <span className="config-field-hint">Tiempo de protección después de reinicio (default: 60000 = 1min)</span>
          </label>
          <label>Max reinicios automáticos
            <input
              type="number" min="0" max="10"
              value={editForm.maxAutoRestarts}
              onChange={(e) => setEditForm({ ...editForm, maxAutoRestarts: parseInt(e.target.value) || 0 })}
            />
            <span className="config-field-hint">Reinicios antes de deshabilitar (default: 1)</span>
          </label>
        </div>
        <button type="button" className="btn-create" onClick={handleSaveGlobal} disabled={saving}>
          <i className="fa-solid fa-save" /> {saving ? 'Guardando...' : 'Guardar Config Global'}
        </button>
      </section>

      {/* ── Sección 2: Botón regla personalizada ── */}
      <section className="config-section-block config-section-block--action">
        <div className="config-custom-rule-row">
          <div>
            <h3 className="config-section-block-title">
              <i className="fa-solid fa-code-branch" /> Regla personalizada
            </h3>
            <p className="config-section-desc">
              Asigna parámetros de alarma específicos a un motor concreto, sobreescribiendo la configuración global.
            </p>
          </div>
          <button type="button" className="btn-create" onClick={() => setShowNewOverride(true)}>
            <i className="fa-solid fa-plus" /> Regla personalizada
          </button>
        </div>
      </section>

      {/* ── Sección 3: Tabla de reglas personalizadas ── */}
      <section className="config-section-block">
        <h3 className="config-section-block-title">
          <i className="fa-solid fa-table-list" /> Reglas activas ({overrides.length})
        </h3>
        {overrides.length === 0 ? (
          <p className="config-empty-state">
            No hay reglas personalizadas. Todos los motores usan la config global.
          </p>
        ) : (
          <>
            <table className="config-alert-table">
              <thead>
                <tr>
                  <th>Motor</th>
                  <th>Consecutivas</th>
                  <th>Gracia</th>
                  <th>Cooldown</th>
                  <th>Max Reinicios</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedOverrides.map((o) => (
                  <tr key={o.motorId}>
                    <td><strong>{o.motor.code}</strong> <span>{o.motor.name}</span></td>
                    <td>{o.alarmConsecutiveReadings}</td>
                    <td>{o.alarmGracePeriodMs / 1000}s</td>
                    <td>{o.postRestartCooldownMs / 1000}s</td>
                    <td>{o.maxAutoRestarts}</td>
                    <td className="config-table-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => onEditOverride(o)}
                        aria-label={`Editar regla de ${o.motor.code}`}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        onClick={() => onDeleteOverride(o.motorId)}
                        aria-label={`Eliminar regla de ${o.motor.code}`}
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="config-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <span>{page + 1} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {showNewOverride && (
        <EditOverrideModal
          motors={motors}
          existingOverrides={overrides}
          onSaved={() => { setShowNewOverride(false); onEditGlobalConfig(editForm!); }}
          onCancel={() => setShowNewOverride(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MqttCredentialsAlert({ credentials, onDismiss }: {
  credentials: { username: string; password: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(`Usuario: ${credentials.username}\nContrasena: ${credentials.password}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(credentials, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mqtt-${credentials.username}.json`;
    a.click();
  }

  return (
    <div className="mqtt-credentials-alert">
      <div className="mqtt-credentials-header">
        <i className="fa-solid fa-key" />
        <strong>Credenciales MQTT generadas</strong>
        <button type="button" className="alert-toast-close" onClick={onDismiss}><i className="fa-solid fa-xmark" /></button>
      </div>
      <p>Guarda estas credenciales. No se mostraran de nuevo.</p>
      <div className="mqtt-credentials-values">
        <code>Usuario: {credentials.username}</code>
        <code>Contrasena: {credentials.password}</code>
      </div>
      <div className="mqtt-credentials-actions">
        <button type="button" className="btn-copy" onClick={handleCopy}>
          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn-download" onClick={handleDownload}>
          <i className="fa-solid fa-download" /> Descargar
        </button>
      </div>
    </div>
  );
}

function CreateMotorForm({ onCreated, onCancel }: {
  onCreated: (result: { mqtt: { username: string; password: string } }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ code: '', name: '', location: '', ratedCurrentA: '', connectionType: 'wifi' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/config/motors', {
        code: form.code,
        name: form.name,
        location: form.location || undefined,
        ratedCurrentA: parseFloat(form.ratedCurrentA),
        connectionType: form.connectionType,
      });
      onCreated({ mqtt: res.data.mqtt });
    } catch (err) {
      setError((err as AxiosError<{ message?: string }>).response?.data?.message || 'Error al crear motor');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Crear Motor</h3>
        {error && <p className="config-error">{error}</p>}
        <div className="config-form-grid">
          <label>Codigo<input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MTR-16" required /></label>
          <label>Nombre<input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Motor Bomba" required /></label>
          <label>Ubicacion<input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Planta 2" /></label>
          <label>Corriente nominal (A)<input type="number" step="0.1" min="0.1" value={form.ratedCurrentA} onChange={(e) => setForm({ ...form, ratedCurrentA: e.target.value })} required /></label>
          <label>Conexión motor/MCU<select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value })}>
            <option value="wifi">WiFi</option>
            <option value="lan">LAN (Ethernet)</option>
          </select></label>
        </div>
        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Creando...' : 'Crear Motor'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function EditMotorModal({ motor, onSaved, onCancel }: {
  motor: Motor;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ name: motor.name, location: motor.location || '', connectionType: motor.connectionType });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/config/motors/${motor.id}`, form);
      onSaved();
    } catch (err) {
      setError((err as AxiosError<{ message?: string }>).response?.data?.message || 'Error al actualizar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Editar {motor.code}</h3>
        {error && <p className="config-error">{error}</p>}
        <div className="config-form-grid">
          <label>Nombre<input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Ubicacion<input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label>Conexión motor/MCU<select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value })}>
            <option value="wifi">WiFi</option>
            <option value="lan">LAN (Ethernet)</option>
          </select></label>
        </div>
        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function EditThresholdsModal({ motorId, sensor, standard, ratedCurrentA, extraHeader, onSaved, onCancel }: {
  motorId: number;
  sensor: Sensor;
  standard?: SensorStandard;
  ratedCurrentA?: number;
  extraHeader?: ReactNode;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ healthyMax: String(sensor.healthyMax), warningMax: String(sensor.warningMax), criticalMax: String(sensor.criticalMax) });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);

  // Efective default thresholds for this motor (current recomputed from rated)
  const effective = standard && (standard.sensorType !== 'current' || ratedCurrentA)
    ? effectiveThresholds(standard, ratedCurrentA ?? 0)
    : null;

  const warnings: string[] = [];
  if (standard && effective) {
    const h = parseFloat(form.healthyMax);
    const w = parseFloat(form.warningMax);
    const c = parseFloat(form.criticalMax);
    if (!isNaN(h) && h > effective.healthyMax) warnings.push(`Saludable (${h}) excede recomendado (${effective.healthyMax})`);
    if (!isNaN(w) && w > effective.warningMax) warnings.push(`Advertencia (${w}) excede recomendado (${effective.warningMax})`);
    if (!isNaN(c) && c > effective.criticalMax) warnings.push(`Critico (${c}) excede recomendado (${effective.criticalMax})`);
  }

  function handleRestoreDefaults() {
    if (!effective) return;
    setForm({
      healthyMax: String(effective.healthyMax),
      warningMax: String(effective.warningMax),
      criticalMax: String(effective.criticalMax),
    });
    setConfirmOverride(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (warnings.length > 0 && !confirmOverride) { setConfirmOverride(true); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/config/motors/${motorId}/sensors/${sensor.id}/thresholds`, {
        healthyMax: parseFloat(form.healthyMax), warningMax: parseFloat(form.warningMax), criticalMax: parseFloat(form.criticalMax),
      });
      onSaved();
    } catch (err) {
      setError((err as AxiosError<{ message?: string }>).response?.data?.message || 'Error al actualizar umbrales');
    } finally {
      setSubmitting(false);
      setConfirmOverride(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Umbrales: {sensor.sensorType}</h3>
        {error && <p className="config-error">{error}</p>}
        {extraHeader}
        {standard && (
          <p className="config-threshold-standard">
            <i className="fa-solid fa-circle-info" /> Estandar: <strong>{standard.standardName}</strong> — Recomendado: {effective ? `${effective.healthyMax}/${effective.warningMax}/${effective.criticalMax}` : `${standard.defaultHealthyMax}/${standard.defaultWarningMax}/${standard.defaultCriticalMax}`} {standard.unit}
          </p>
        )}
        <p className="config-threshold-help">Deben cumplir: Saludable &lt; Advertencia &lt; Critico</p>
        <div className="config-form-grid">
          <label>Max Saludable<input type="number" step="0.1" value={form.healthyMax} onChange={(e) => { setForm({ ...form, healthyMax: e.target.value }); setConfirmOverride(false); }} required /></label>
          <label>Max Advertencia<input type="number" step="0.1" value={form.warningMax} onChange={(e) => { setForm({ ...form, warningMax: e.target.value }); setConfirmOverride(false); }} required /></label>
          <label>Max Critico<input type="number" step="0.1" value={form.criticalMax} onChange={(e) => { setForm({ ...form, criticalMax: e.target.value }); setConfirmOverride(false); }} required /></label>
        </div>
        {warnings.length > 0 && (
          <div className="config-threshold-warnings">
            <i className="fa-solid fa-triangle-exclamation" />
            <div>
              <strong>Valores por encima del estandar:</strong>
              <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              {confirmOverride && <p className="config-threshold-confirm">Confirmar que deseas usar estos valores.</p>}
            </div>
          </div>
        )}
        <div className="config-form-actions">
          {effective && (
            <button
              type="button"
              className="btn-cancel"
              onClick={handleRestoreDefaults}
              disabled={submitting}
            >
              <i className="fa-solid fa-rotate-left" /> Restaurar valores por defecto
            </button>
          )}
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Guardando...' : confirmOverride ? 'Confirmar' : 'Guardar'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function EditOverrideModal({ motorId, existingOverride, motors, existingOverrides, onSaved, onCancel }: {
  motorId?: number;
  existingOverride?: AlertOverride;
  motors: Motor[];
  existingOverrides: AlertOverride[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!existingOverride;
  const availableMotors = motors.filter((m) =>
    !existingOverrides.some((o) => o.motorId === m.id) || m.id === motorId
  );

  const [selectedMotorId, setSelectedMotorId] = useState(motorId || (availableMotors[0]?.id ?? 0));
  const [form, setForm] = useState({
    alarmConsecutiveReadings: existingOverride?.alarmConsecutiveReadings ?? 5,
    alarmGracePeriodMs: existingOverride?.alarmGracePeriodMs ?? 120000,
    postRestartCooldownMs: existingOverride?.postRestartCooldownMs ?? 60000,
    maxAutoRestarts: existingOverride?.maxAutoRestarts ?? 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetMotorId = isEdit ? motorId! : selectedMotorId;
    if (!targetMotorId) { setError('Selecciona un motor'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/config/alerts/overrides', { motorId: targetMotorId, ...form });
      onSaved();
    } catch (err) {
      setError((err as AxiosError<{ message?: string }>).response?.data?.message || 'Error al guardar override');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? `Editar regla: ${existingOverride?.motor.code}` : 'Nueva regla por motor'}</h3>
        {error && <p className="config-error">{error}</p>}
        {!isEdit && (
          <label>Motor
            <select value={selectedMotorId} onChange={(e) => setSelectedMotorId(parseInt(e.target.value))}>
              {availableMotors.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="config-form-grid">
          <label>Lecturas consecutivas para alarma
            <input type="number" min="1" value={form.alarmConsecutiveReadings} onChange={(e) => setForm({ ...form, alarmConsecutiveReadings: parseInt(e.target.value) || 1 })} />
          </label>
          <label>Periodo de gracia (ms)
            <input type="number" min="5000" step="1000" value={form.alarmGracePeriodMs} onChange={(e) => setForm({ ...form, alarmGracePeriodMs: parseInt(e.target.value) || 5000 })} />
          </label>
          <label>Cooldown post-reinicio (ms)
            <input type="number" min="10000" step="1000" value={form.postRestartCooldownMs} onChange={(e) => setForm({ ...form, postRestartCooldownMs: parseInt(e.target.value) || 10000 })} />
          </label>
          <label>Max reinicios automaticos
            <input type="number" min="0" max="10" value={form.maxAutoRestarts} onChange={(e) => setForm({ ...form, maxAutoRestarts: parseInt(e.target.value) || 0 })} />
          </label>
        </div>
        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Guardando...' : isEdit ? 'Actualizar Regla' : 'Crear Regla'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
