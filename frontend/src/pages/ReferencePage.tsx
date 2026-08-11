import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

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

const SENSOR_LABELS: Record<string, string> = {
  temperature: 'Temperatura',
  vibration: 'Vibración',
  current: 'Corriente',
};

const DEFAULT_CONFIG: AlertConfig = {
  alarmConsecutiveReadings: 5,
  alarmGracePeriodMs: 120_000,
  postRestartCooldownMs: 60_000,
  maxAutoRestarts: 1,
};

/**
 * Reference page — explains all motor and sensor states.
 * Accessible from the dashboard for operators to consult.
 *
 * Thresholds and alarm parameters are loaded from the API so the page
 * always reflects the current configuration (they are hot-reloadable).
 */
export function ReferencePage() {
  const navigate = useNavigate();
  const [standards, setStandards] = useState<SensorStandard[]>([]);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [standardsRes, alertsRes] = await Promise.all([
          api.get('/config/standards'),
          api.get('/config/alerts'),
        ]);
        if (!active) return;
        setStandards(standardsRes.data as SensorStandard[]);
        setAlertConfig((alertsRes.data as AlertConfig) ?? DEFAULT_CONFIG);
      } catch {
        if (active) setError('Error al cargar la configuracion de referencia');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const consecutive = alertConfig.alarmConsecutiveReadings ?? DEFAULT_CONFIG.alarmConsecutiveReadings;
  const graceSec = Math.round(
    (alertConfig.alarmGracePeriodMs ?? DEFAULT_CONFIG.alarmGracePeriodMs) / 1000,
  );
  const cooldownSec = Math.round(
    (alertConfig.postRestartCooldownMs ?? DEFAULT_CONFIG.postRestartCooldownMs) / 1000,
  );
  const maxRestarts = alertConfig.maxAutoRestarts ?? DEFAULT_CONFIG.maxAutoRestarts;

  return (
    <div className="reference-page">
      <button
        type="button"
        className="back-button"
        onClick={() => navigate('/dashboard')}
        aria-label="Volver al panel"
      >
        &larr; Volver al panel
      </button>

      <h1>Referencia de Estados</h1>

      {loading ? (
        <div className="reference-loading">Cargando configuracion...</div>
      ) : error ? (
        <p className="config-error">{error}</p>
      ) : (
        <>
          <section>
            <h2>Estados del Motor</h2>
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Significado</th>
                  <th>Acción recomendada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="ref-badge ref-healthy">Saludable</span></td>
                  <td>Todas las lecturas dentro de umbrales normales.</td>
                  <td>Ninguna. Operación normal.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-alarm">Alarma</span></td>
                  <td>
                    Un sensor acumuló {consecutive} lecturas consecutivas anómalas
                    (configurable por motor). El sistema abre una ventana de gracia de{' '}
                    {graceSec} segundos antes de actuar automáticamente. Si las lecturas
                    se normalizan o un operador resuelve la alerta, el motor vuelve a Saludable.
                  </td>
                  <td>
                    Revisar el motor y sus sensores. Si es una falsa alarma, resolver la alerta.
                    Si es real, detener manualmente o esperar el reinicio automático.
                  </td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-shutting-down">Deteniendo</span></td>
                  <td>El sistema está enviando el comando de parada al motor (previo al reinicio automático). También ocurre ante una sola lectura en zona crítica, que dispara la parada de inmediato sin esperar la ventana de gracia.</td>
                  <td>Esperar. El reinicio iniciará automáticamente.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-restarting">Reiniciando</span></td>
                  <td>El motor está en ciclo de reinicio (100 segundos de espera anti-cortocircuito).</td>
                  <td>Esperar el conteo regresivo. Al finalizar, el motor retoma operación normal.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-disabled">Deshabilitado</span></td>
                  <td>
                    El motor fue reiniciado automáticamente pero la anomalía persistió. Solo se
                    permite {maxRestarts} reinicio automático por episodio.
                  </td>
                  <td>Inspección física obligatoria. Reactivar manualmente solo después de corregir la causa.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-manual-shutdown">Parada manual</span></td>
                  <td>Un operador o administrador detuvo el motor explícitamente.</td>
                  <td>Reiniciar cuando se considere seguro hacerlo.</td>
                </tr>
              </tbody>
            </table>
            <p className="reference-note">
              <i className="fa-solid fa-circle-info" aria-hidden="true" /> Después de un reinicio,
              el motor entra en un periodo de cooldown de {cooldownSec} segundos: durante ese tiempo
              se requieren {consecutive * 2} lecturas consecutivas para volver a alarmar y una lectura
              crítica no dispara la parada inmediata. Las lecturas y el periodo de gracia se pueden
              ajustar por motor en Configuración.
            </p>
          </section>

          <section>
            <h2>Estados del Sensor</h2>
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Significado</th>
                  <th>Acción recomendada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="ref-badge ref-healthy">Normal</span></td>
                  <td>El sensor reporta valores válidos dentro del rango plausible.</td>
                  <td>Ninguna.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-fault">Falla</span></td>
                  <td>
                    El sensor tiene un problema detectado:
                    <ul>
                      <li><strong>Fuera de rango:</strong> valor físicamente imposible.</li>
                      <li><strong>Atascado:</strong> mismo valor por 20 lecturas consecutivas (5 min).</li>
                      <li><strong>Desconectado:</strong> sin datos en la ventana de gracia (20s WiFi / 5s LAN).</li>
                    </ul>
                    Se intentará un reinicio automático del sensor (5 segundos).
                  </td>
                  <td>Monitorear si se recupera tras el reinicio automático.</td>
                </tr>
                <tr>
                  <td><span className="ref-badge ref-fault-persistent">Falla persistente</span></td>
                  <td>El sensor falló nuevamente después del reinicio automático. Requiere intervención manual.</td>
                  <td>Reemplazar o recalibrar el sensor. Reactivar manualmente tras la corrección.</td>
                </tr>
              </tbody>
            </table>
            <p className="reference-note">
              <i className="fa-solid fa-circle-info" aria-hidden="true" /> Las lecturas de un sensor en
              falla NO participan en la evaluación de salud del motor.
            </p>
          </section>

          <section>
            <h2>Tipos de Alerta</h2>
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Cuándo se genera</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Alarma de motor</td>
                  <td>{consecutive} lecturas consecutivas anómalas en un sensor. Abre la ventana de gracia de {graceSec} segundos.</td>
                </tr>
                <tr>
                  <td>Trip forzado</td>
                  <td>La ventana de gracia venció sin intervención, o una lectura crítica disparó la parada inmediata.</td>
                </tr>
                <tr>
                  <td>Motor deshabilitado</td>
                  <td>La anomalía persistió después del reinicio automático. Motor fuera de servicio.</td>
                </tr>
                <tr>
                  <td>Falla de sensor</td>
                  <td>Un sensor detectó un problema (fuera de rango, atascado o desconectado). Se intenta el reinicio automático.</td>
                </tr>
                <tr>
                  <td>Falla persistente de sensor</td>
                  <td>El sensor falló nuevamente después del reinicio automático. Requiere intervención manual.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Umbrales por Sensor</h2>
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th>Normal (máx)</th>
                  <th>Advertencia (máx)</th>
                  <th>Crítico (sobre)</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {standards.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No hay estándares cargados.</td>
                  </tr>
                ) : (
                  standards.map((s) => (
                    <tr key={s.id}>
                      <td>{SENSOR_LABELS[s.sensorType] || s.sensorType}</td>
                      <td>
                        {s.defaultHealthyMax} {s.unit}
                      </td>
                      <td>
                        {s.defaultWarningMax} {s.unit}
                      </td>
                      <td>&gt; {s.defaultCriticalMax} {s.unit}</td>
                      <td>{s.standardName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p className="reference-note">
              <i className="fa-solid fa-circle-info" aria-hidden="true" /> Valores de referencia
              globales. Los umbrales se pueden ajustar por motor en Configuración (los motores nuevos
              heredan estos valores al crearse).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
