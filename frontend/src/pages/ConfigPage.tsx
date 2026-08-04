import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { invalidateMotors } from '../store/motors.slice';
import { api } from '../services/api';

interface Motor {
  id: number;
  code: string;
  name: string;
  location: string | null;
  connectionType: string;
  ratedCurrentA: number;
  insulationClass: string;
  sensors: Sensor[];
}

interface Sensor {
  id: number;
  sensorType: string;
  healthyMax: number;
  warningMax: number;
  criticalMax: number;
}

interface SensorStandard {
  id: number;
  sensorType: string;
  standardName: string;
  unit: string;
  defaultHealthyMax: number;
  defaultWarningMax: number;
  defaultCriticalMax: number;
}

/**
 * Admin-only configuration page.
 * Allows creating, editing, and deleting motors + editing sensor thresholds.
 * Creating a motor also provisions MQTT credentials (shown once).
 */
export function ConfigPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const userRole = useSelector((state: RootState) => state.auth.user?.role);
  const [motors, setMotors] = useState<Motor[]>([]);
  const [standards, setStandards] = useState<SensorStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMotorId, setEditingMotorId] = useState<number | null>(null);
  const [editingThresholds, setEditingThresholds] = useState<{ motorId: number; sensor: Sensor } | null>(null);
  const [mqttCredentials, setMqttCredentials] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Track if any mutation happened so we invalidate on leave. */
  const [dirty, setDirty] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (userRole && userRole !== 'admin') {
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  // Invalidate motors cache when leaving the config page if changes were made
  useEffect(() => {
    return () => {
      if (dirty) {
        dispatch(invalidateMotors());
      }
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
      setError('Error al cargar motores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMotors();
  }, [fetchMotors]);

  if (loading) {
    return (
      <div className="config-page">
        <p>Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <button type="button" className="back-button" onClick={() => { if (dirty) dispatch(invalidateMotors()); navigate('/dashboard'); }}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Volver
        </button>
        <h1>Configuración de Motores</h1>
        <button
          type="button"
          className="btn-create"
          onClick={() => setShowCreateForm(true)}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" /> Nuevo Motor
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {mqttCredentials && (
        <MqttCredentialsAlert
          credentials={mqttCredentials}
          onDismiss={() => setMqttCredentials(null)}
        />
      )}

      {showCreateForm && (
        <CreateMotorForm
          onCreated={(result) => {
            setShowCreateForm(false);
            setMqttCredentials(result.mqtt);
            setDirty(true);
            fetchMotors();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <div className="config-motor-list">
        {motors.map((motor) => (
          <div key={motor.id} className="config-motor-item">
            <div className="config-motor-info">
              <strong>{motor.code}</strong>
              <span>{motor.name}</span>
              <span className="config-motor-location">{motor.location || '—'}</span>
              <span className="config-motor-conn">{motor.connectionType}</span>
            </div>
            <div className="config-motor-actions">
              <button
                type="button"
                className="btn-icon"
                onClick={() => setEditingMotorId(motor.id)}
                aria-label={`Editar ${motor.code}`}
              >
                <i className="fa-solid fa-pen" />
              </button>
              <button
                type="button"
                className="btn-icon btn-icon--danger"
                onClick={() => handleDelete(motor)}
                aria-label={`Eliminar ${motor.code}`}
              >
                <i className="fa-solid fa-trash" />
              </button>
            </div>
            <div className="config-sensors">
              {motor.sensors.map((sensor) => (
                <button
                  key={sensor.id}
                  type="button"
                  className="config-sensor-chip"
                  onClick={() => setEditingThresholds({ motorId: motor.id, sensor })}
                >
                  {sensor.sensorType}: {sensor.healthyMax}/{sensor.warningMax}/{sensor.criticalMax}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );

  async function handleDelete(motor: Motor) {
    if (!window.confirm(`¿Eliminar motor ${motor.code}? Esto también eliminará sus credenciales MQTT.`)) {
      return;
    }
    try {
      await api.delete(`/config/motors/${motor.id}`);
      setDirty(true);
      fetchMotors();
    } catch {
      setError(`Error al eliminar motor ${motor.code}`);
    }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MqttCredentialsAlert({
  credentials,
  onDismiss,
}: {
  credentials: { username: string; password: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = `Usuario: ${credentials.username}\nContraseña: ${credentials.password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const data = JSON.stringify(
      { username: credentials.username, password: credentials.password },
      null,
      2,
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mqtt-credentials-${credentials.username}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mqtt-credentials-alert">
      <div className="mqtt-credentials-header">
        <i className="fa-solid fa-key" aria-hidden="true" />
        <strong>Credenciales MQTT generadas</strong>
        <button type="button" className="alert-toast-close" onClick={onDismiss}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
      <p>Estas credenciales se muestran una sola vez. Guardarlas ahora.</p>
      <div className="mqtt-credentials-values">
        <code>Usuario: {credentials.username}</code>
        <code>Contraseña: {credentials.password}</code>
      </div>
      <div className="mqtt-credentials-actions">
        <button type="button" className="btn-copy" onClick={handleCopy}>
          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn-download" onClick={handleDownload}>
          <i className="fa-solid fa-download" aria-hidden="true" />
          Descargar JSON
        </button>
      </div>
    </div>
  );
}

function CreateMotorForm({
  onCreated,
  onCancel,
}: {
  onCreated: (result: { mqtt: { username: string; password: string } }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    location: '',
    ratedCurrentA: '',
    connectionType: 'Y',
  });
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
    <form className="config-form" onSubmit={handleSubmit}>
      <h3>Crear Motor</h3>
      {error && <p className="error">{error}</p>}
      <div className="config-form-grid">
        <label>
          Código
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="MOT-16"
            required
          />
        </label>
        <label>
          Nombre
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Motor Bomba Sector B"
            required
          />
        </label>
        <label>
          Ubicación
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Planta 2, Sector B"
          />
        </label>
        <label>
          Corriente nominal (A)
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={form.ratedCurrentA}
            onChange={(e) => setForm({ ...form, ratedCurrentA: e.target.value })}
            required
          />
        </label>
        <label>
          Tipo conexión
          <select
            value={form.connectionType}
            onChange={(e) => setForm({ ...form, connectionType: e.target.value })}
          >
            <option value="Y">Y (Estrella)</option>
            <option value="D">D (Delta)</option>
            <option value="YD">YD (Estrella-Delta)</option>
          </select>
        </label>
      </div>
      <div className="config-form-actions">
        <button type="submit" className="btn-create" disabled={submitting}>
          {submitting ? 'Creando...' : 'Crear Motor'}
        </button>
        <button type="button" className="btn-cancel" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EditMotorModal({
  motor,
  onSaved,
  onCancel,
}: {
  motor: Motor;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: motor.name,
    location: motor.location || '',
    connectionType: motor.connectionType,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.patch(`/config/motors/${motor.id}`, {
        name: form.name,
        location: form.location || undefined,
        connectionType: form.connectionType,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar motor');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Editar {motor.code}</h3>
        {error && <p className="error">{error}</p>}
        <div className="config-form-grid">
          <label>
            Nombre
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Ubicación
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label>
            Tipo conexión
            <select
              value={form.connectionType}
              onChange={(e) => setForm({ ...form, connectionType: e.target.value })}
            >
              <option value="Y">Y (Estrella)</option>
              <option value="D">D (Delta)</option>
              <option value="YD">YD (Estrella-Delta)</option>
            </select>
          </label>
        </div>
        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function EditThresholdsModal({
  motorId,
  sensor,
  standard,
  onSaved,
  onCancel,
}: {
  motorId: number;
  sensor: Sensor;
  standard?: SensorStandard;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    healthyMax: String(sensor.healthyMax),
    warningMax: String(sensor.warningMax),
    criticalMax: String(sensor.criticalMax),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState(false);

  // Check if any value exceeds the standard recommendation
  const warnings: string[] = [];
  if (standard) {
    const h = parseFloat(form.healthyMax);
    const w = parseFloat(form.warningMax);
    const c = parseFloat(form.criticalMax);
    if (!isNaN(h) && h > standard.defaultHealthyMax) {
      warnings.push(`Saludable (${h}) excede el recomendado (${standard.defaultHealthyMax} ${standard.unit})`);
    }
    if (!isNaN(w) && w > standard.defaultWarningMax) {
      warnings.push(`Advertencia (${w}) excede el recomendado (${standard.defaultWarningMax} ${standard.unit})`);
    }
    if (!isNaN(c) && c > standard.defaultCriticalMax) {
      warnings.push(`Crítico (${c}) excede el recomendado (${standard.defaultCriticalMax} ${standard.unit})`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // If there are warnings and user hasn't confirmed, show confirmation
    if (warnings.length > 0 && !confirmOverride) {
      setConfirmOverride(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.patch(`/config/motors/${motorId}/sensors/${sensor.id}/thresholds`, {
        healthyMax: parseFloat(form.healthyMax),
        warningMax: parseFloat(form.warningMax),
        criticalMax: parseFloat(form.criticalMax),
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar umbrales');
    } finally {
      setSubmitting(false);
      setConfirmOverride(false);
    }
  }

  // Reset confirmation when form values change
  function updateForm(newForm: typeof form) {
    setForm(newForm);
    setConfirmOverride(false);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="config-form modal-content" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h3>Umbrales: {sensor.sensorType}</h3>
        {error && <p className="error">{error}</p>}

        {standard && (
          <p className="config-threshold-standard">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            Estándar: <strong>{standard.standardName}</strong> —
            Recomendado: {standard.defaultHealthyMax} / {standard.defaultWarningMax} / {standard.defaultCriticalMax} {standard.unit}
          </p>
        )}

        <p className="config-threshold-help">
          Deben cumplir: Saludable &lt; Advertencia &lt; Crítico
        </p>
        <div className="config-form-grid">
          <label>
            Máx. Saludable
            <input
              type="number"
              step="0.1"
              value={form.healthyMax}
              onChange={(e) => updateForm({ ...form, healthyMax: e.target.value })}
              required
            />
          </label>
          <label>
            Máx. Advertencia
            <input
              type="number"
              step="0.1"
              value={form.warningMax}
              onChange={(e) => updateForm({ ...form, warningMax: e.target.value })}
              required
            />
          </label>
          <label>
            Máx. Crítico
            <input
              type="number"
              step="0.1"
              value={form.criticalMax}
              onChange={(e) => updateForm({ ...form, criticalMax: e.target.value })}
              required
            />
          </label>
        </div>

        {warnings.length > 0 && (
          <div className="config-threshold-warnings">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <div>
              <strong>Valores por encima del estándar recomendado:</strong>
              <ul>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              {confirmOverride && (
                <p className="config-threshold-confirm">
                  ¿Desea continuar? No se recomienda exceder estos valores.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="config-form-actions">
          <button type="submit" className="btn-create" disabled={submitting}>
            {submitting ? 'Guardando...' : confirmOverride ? 'Confirmar y Guardar' : 'Guardar Umbrales'}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
