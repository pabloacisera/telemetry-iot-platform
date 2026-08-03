import { useNavigate } from 'react-router-dom';

/**
 * Reference page — explains all motor and sensor states.
 * Accessible from the dashboard for operators to consult.
 */
export function ReferencePage() {
  const navigate = useNavigate();

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
              <td><span className="ref-badge ref-under-review">En revisión</span></td>
              <td>Se detectaron lecturas anómalas (5/8 en zona de advertencia o 1 lectura crítica). El sistema espera 2 minutos antes de actuar automáticamente.</td>
              <td>Revisar el motor y sus sensores. Si es una falsa alarma, resolver la alerta. Si es real, detener manualmente o esperar el reinicio automático.</td>
            </tr>
            <tr>
              <td><span className="ref-badge ref-shutting-down">Deteniendo</span></td>
              <td>El sistema está enviando el comando de parada al motor (previo al reinicio automático).</td>
              <td>Esperar. El reinicio iniciará automáticamente.</td>
            </tr>
            <tr>
              <td><span className="ref-badge ref-restarting">Reiniciando</span></td>
              <td>El motor está en ciclo de reinicio (100 segundos de espera anti-cortocircuito).</td>
              <td>Esperar el conteo regresivo. Al finalizar, el motor retoma operación normal.</td>
            </tr>
            <tr>
              <td><span className="ref-badge ref-disabled">Deshabilitado</span></td>
              <td>El motor fue reiniciado automáticamente pero la anomalía persistió. Solo se permite 1 reinicio automático por episodio.</td>
              <td>Inspección física obligatoria. Reactivar manualmente solo después de corregir la causa.</td>
            </tr>
            <tr>
              <td><span className="ref-badge ref-manual-shutdown">Parada manual</span></td>
              <td>Un operador o administrador detuvo el motor explícitamente.</td>
              <td>Reiniciar cuando se considere seguro hacerlo.</td>
            </tr>
          </tbody>
        </table>
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
              <td>Advertencia</td>
              <td>5/8 lecturas en zona de advertencia, o 1 lectura en zona crítica.</td>
            </tr>
            <tr>
              <td>Reinicio forzado</td>
              <td>El sistema reinició el motor automáticamente tras 2 minutos sin intervención.</td>
            </tr>
            <tr>
              <td>Deshabilitado</td>
              <td>La anomalía persistió después del reinicio automático. Motor fuera de servicio.</td>
            </tr>
            <tr>
              <td>Falla general de sensores</td>
              <td>Los 3 sensores del motor están en falla simultáneamente. No se puede evaluar el motor.</td>
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
            <tr>
              <td>Vibración</td>
              <td>1.8 mm/s</td>
              <td>4.5 mm/s</td>
              <td>&gt; 4.5 mm/s</td>
              <td>ISO 10816-3 Clase I</td>
            </tr>
            <tr>
              <td>Temperatura</td>
              <td>70 °C</td>
              <td>90 °C</td>
              <td>&gt; 90 °C</td>
              <td>NEMA MG-1 Clase B</td>
            </tr>
            <tr>
              <td>Corriente</td>
              <td>1.05× nominal</td>
              <td>1.3× nominal</td>
              <td>&gt; 1.3× nominal</td>
              <td>Protección estándar de motores</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
