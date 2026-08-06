import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { invalidateMotors } from '../store/motors.slice';
import { api } from '../services/api';
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

type Tab = 'motors' | 'sensors' | 'alerts';

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('motors');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMotorId, setEditingMotorId] = useState<number | null>(null);
  const [editingThresholds, setEditingThresholds] = useState<{ motorId: number; sensor: Sensor } | null>(null);
  const [editingAlertParams, setEditingAlertParams] = useState<Motor | null>(null);
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

  const fetchMotors = useCallback(async () => {
    try {
      const [motorsRes, standardsRes] = await Promise.all([
        api.get('/config/motors'),
        api.get('/config/standards'),
      ]);
      setMotors(motorsRes.data);
      setStandards(standardsRes.data);
    } catch {
      setError('Error al cargar configuracion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMotors(); }, [fetchMotors]);

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
          <SensorsTab motors={motors} standards={standards} onEditThresholds={(motorId, sensor) => setEditingThresholds({ motorId, sensor })} />
        )}
        {activeTab === 'alerts' && (
          <AlertsTab motors={motors} onEditParams={(m) => setEditingAlertParams(m)} />
        )}
      </div>

      {showCreateForm && (
        <CreateMotorForm
          onCreated={(result) => { setShowCreateForm(false); setMqttCredentials(result.mqtt); setDirty(true); fetchMotors(); }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingMotorId !== null && (
        <EditMotorModal
          motor={motors.find((m) => m.id === editingMotorId)!}
          onSaved={() => { setEditingMotorId(null); setDirty(true); fetchMotors(); }}
          onCancel={() => setEditingMotorId(null)}
        />
      )}

      {editingThresholds && (
        <EditThresholdsModal
          motorId={editingThresholds.motorId}
          sensor={editingThresholds.sensor}
          standard={standards.find((s) => s.sensorType === editingThresholds.sensor.sensorType)}
          onSaved={() => { setEditingThresholds(null); setDirty(true); fetchMotors(); }}
          onCancel={() => setEditingThresholds(null)}
        />
      )}

      {editingAlertParams && (
        <EditAlertParamsModal
          motor={editingAlertParams}
          onSaved={() => { setEditingAlertParams(null); setDirty(true); fetchMotors(); }}
          onCancel={() => setEditingAlertParams(null)}
        />
      )}
    </div>
  );

  async function handleDelete(motor: Motor) {
    if (!window.confirm(`Eliminar motor ${motor.code}? Eliminara sus credenciales MQTT.`)) return;
    try {
      await api.delete(`/config/motors/${motor.id}`);
      setDirty(true);
      fetchMotors();
    } catch {
      setError(`Error al eliminar motor ${motor.code}`);
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
  return (
    <div>
      <div className="config-tab-header">
        <span className="config-tab-count">{motors.length} motores</span>
        <button type="button" className="btn-create" onClick={onCreate}>
          <i className="fa-solid fa-plus" /> Nuevo Motor
        </button>
      </div>
      <div className="config-motor-list">
        {motors.map((motor) => (
          <div key={motor.id} className={`config-motor-item ${motor.status !== 'healthy' ? 'config-motor-item--attention' : ''}`}>
            <div className="config-motor-row">
              <StatusBadge status={motor.status} />
              <strong className="config-motor-code">{motor.code}</strong>
              <span className="config-motor-name">{motor.name}</span>
              <span className="config-motor-location">{motor.location || '—'}</span>
              <span className="config-motor-conn">{motor.connectionType}</span>
              <div className="config-motor-actions">
                <button type="button" className="btn-icon" onClick={() => onEdit(motor)} aria-label={`Editar ${motor.code}`}>
                  <i className="fa-solid fa-pen" />
                </button>
                <button type="button" className="btn-icon btn-icon--danger" onClick={() => onDelete(motor)} aria-label={`Eliminar ${motor.code}`}>
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
            <div className="config-sensors">
              {motor.sensors.map((sensor) => (
                <button key={sensor.id} type="button" className="config-sensor-chip" onClick={() => onEditThresholds(motor.id, sensor)}>
                  {sensor.sensorType}: {sensor.healthyMax}/{sensor.warningMax}/{sensor.criticalMax}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Sensors ─────────────────────────────────────────────────────────────

function SensorsTab({ motors, standards, onEditThresholds }: {
  motors: Motor[];
  standards: SensorStandard[];
  onEditThresholds: (motorId: number, sensor: Sensor) => void;
}) {
  const sensorTypes = ['temperature', 'vibration', 'current'];
  const sensorLabels: Record<string, string> = { temperature: 'Temperatura', vibration: 'Vibracion', current: 'Corriente' };
  const sensorIcons: Record<string, string> = { temperature: 'fa-temperature-half', vibration: 'fa-wave-square', current: 'fa-bolt' };

  return (
    <div>
      <p className="config-section-desc">Umbrales de deteccion por tipo de sensor. Estos valores se aplican por defecto a nuevos motores.</p>
      <div className="config-sensor-grid">
        {sensorTypes.map((type) => {
          const standard = standards.find((s) => s.sensorType === type);
          return (
            <div key={type} className="config-sensor-card">
              <div className="config-sensor-card-header">
                <i className={`fa-solid ${sensorIcons[type]}`} />
                <h3>{sensorLabels[type]}</h3>
              </div>
              {standard && (
                <div className="config-sensor-card-body">
                  <div className="config-sensor-threshold-row">
                    <span className="config-sensor-label">Saludable</span>
                    <span className="config-sensor-value config-sensor-value--green">{standard.defaultHealthyMax} {standard.unit}</span>
                  </div>
                  <div className="config-sensor-threshold-row">
                    <span className="config-sensor-label">Advertencia</span>
                    <span className="config-sensor-value config-sensor-value--yellow">{standard.defaultWarningMax} {standard.unit}</span>
                  </div>
                  <div className="config-sensor-threshold-row">
                    <span className="config-sensor-label">Critico</span>
                    <span className="config-sensor-value config-sensor-value--red">{standard.defaultCriticalMax} {standard.unit}</span>
                  </div>
                  <p className="config-sensor-standard-ref">
                    <i className="fa-solid fa-book" /> {standard.standardName}
                  </p>
                </div>
              )}
              <div className="config-sensor-card-motors">
                <span className="config-sensor-motor-count">{motors.length} motores</span>
                <span className="config-sensor-edit-hint">Edita por motor en la pestana Motores</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Alerts ──────────────────────────────────────────────────────────────

function AlertsTab({ motors, onEditParams }: {
  motors: Motor[];
  onEditParams: (m: Motor) => void;
}) {
  return (
    <div>
      <p className="config-section-desc">Parámetros de proteccion y alarmas por motor. Los cambios se aplican inmediatamente.</p>
      <div className="config-alerts-list">
        {motors.map((motor) => (
          <div key={motor.id} className="config-alerts-item">
            <div className="config-alerts-item-header">
              <StatusBadge status={motor.status} />
              <strong>{motor.code}</strong>
              <span>{motor.name}</span>
              <button type="button" className="btn-icon" onClick={() => onEditParams(motor)} aria-label={`Editar parametros de ${motor.code}`}>
                <i className="fa-solid fa-pen" />
              </button>
            </div>
            <div className="config-alerts-params">
              <div className="config-alerts-param">
                <span className="config-alerts-param-label">Lecturas consecutivas</span>
                <span className="config-alerts-param-value">{motor.alarmConsecutiveReadings}</span>
              </div>
              <div className="config-alerts-param">
                <span className="config-alerts-param-label">Periodo de gracia</span>
                <span className="config-alerts-param-value">{motor.alarmGracePeriodMs / 1000}s</span>
              </div>
              <div className="config-alerts-param">
                <span className="config-alerts-param-label">Cooldown post-reinicio</span>
                <span className="config-alerts-param-value">{motor.postRestartCooldownMs / 1000}s</span>
              </div>
              <div className="config-alerts-param">
                <span className="config-alerts-param-label">Max reinicios auto</span>
                <span className="config-alerts-param-value">{motor.maxAutoRestarts}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear motor');
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
          <label>Conexion<select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value })}>
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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar');
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
          <label>Conexion<select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value })}>
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

function EditThresholdsModal({ motorId, sensor, standard, onSaved, onCancel }: {
  motorId: number;
  sensor: Sensor;
  standard?: SensorStandard;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ healthyMax: String(sensor.healthyMax), warningMax: String(sensor.warningMax), criticalMax: String(sensor.criticalMax) });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);

  const warnings: string[] = [];
  if (standard) {
    const h = parseFloat(form.healthyMax);
    const w = parseFloat(form.warningMax);
    const c = parseFloat(form.criticalMax);
    if (!isNaN(h) && h > standard.defaultHealthyMax) warnings.push(`Saludable (${h}) excede recomendado (${standard.defaultHealthyMax})`);
    if (!isNaN(w) && w > standard.defaultWarningMax) warnings.push(`Advertencia (${w}) excede recomendado (${standard.defaultWarningMax})`);
    if (!isNaN(c) && c > standard.defaultCriticalMax) warnings.push(`Critico (${c}) excede recomendado (${standard.defaultCriticalMax})`);
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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar umbrales');
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
        {standard && (
          <p className="config-threshold-standard">
            <i className="fa-solid fa-circle-info" /> Estandar: <strong>{standard.standardName}</strong> — Recomendado: {standard.defaultHealthyMax}/{standard.defaultWarningMax}/{standard.defaultCriticalMax} {standard.unit}
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
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Guardando...' : confirmOverride ? 'Confirmar' : 'Guardar'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function EditAlertParamsModal({ motor, onSaved, onCancel }: {
  motor: Motor;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    alarmConsecutiveReadings: motor.alarmConsecutiveReadings,
    alarmGracePeriodMs: motor.alarmGracePeriodMs,
    postRestartCooldownMs: motor.postRestartCooldownMs,
    maxAutoRestarts: motor.maxAutoRestarts,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/config/motors/${motor.id}`, form);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar parametros');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Parametros de alarma: {motor.code}</h3>
        {error && <p className="config-error">{error}</p>}
        <div className="config-form-grid">
          <label>Lecturas consecutivas para alarma
            <input type="number" min="1" value={form.alarmConsecutiveReadings} onChange={(e) => setForm({ ...form, alarmConsecutiveReadings: parseInt(e.target.value) || 1 })} />
            <span className="config-field-hint">Lecturas anomalias seguidas antes de alarma (default: 5)</span>
          </label>
          <label>Periodo de gracia (ms)
            <input type="number" min="5000" step="1000" value={form.alarmGracePeriodMs} onChange={(e) => setForm({ ...form, alarmGracePeriodMs: parseInt(e.target.value) || 5000 })} />
            <span className="config-field-hint">Tiempo antes de auto-trip (default: 120000 = 2min)</span>
          </label>
          <label>Cooldown post-reinicio (ms)
            <input type="number" min="10000" step="1000" value={form.postRestartCooldownMs} onChange={(e) => setForm({ ...form, postRestartCooldownMs: parseInt(e.target.value) || 10000 })} />
            <span className="config-field-hint">Tiempo de proteccion despues de reinicio (default: 60000 = 1min)</span>
          </label>
          <label>Max reinicios automaticos
            <input type="number" min="0" max="10" value={form.maxAutoRestarts} onChange={(e) => setForm({ ...form, maxAutoRestarts: parseInt(e.target.value) || 0 })} />
            <span className="config-field-hint">Reinicios antes de deshabilitar (default: 1)</span>
          </label>
        </div>
        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar Parametros'}</button>
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
