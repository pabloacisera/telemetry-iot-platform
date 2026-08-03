/**
 * Knowledge base fragments for the RAG module.
 * Each fragment is grounded in ISO/NEMA standards and cites its source.
 * These are vectorized and stored in MongoDB's `embeddings` collection.
 */
export const KNOWLEDGE_FRAGMENTS = [
  // Vibration - ISO 10816-3
  {
    chunk_text:
      'According to ISO 10816-3 (Class I motors, <15kW), vibration severity zones are: ' +
      'Zone A (new/good condition): up to 0.71 mm/s RMS. Zone B (acceptable for long-term operation): ' +
      'up to 1.80 mm/s RMS. Zone C (limited operation, corrective action needed): up to 4.5 mm/s RMS. ' +
      'Zone D (damaging, immediate action required): above 4.5 mm/s RMS.',
    topic: 'vibration_thresholds',
    source_reference: 'ISO 10816-3, Class I (vibromera.eu, fabrico.io)',
  },
  {
    chunk_text:
      'High vibration in industrial motors typically indicates one of: mechanical imbalance ' +
      '(most common, caused by uneven mass distribution on the rotor), misalignment (coupling or shaft), ' +
      'bearing degradation (wear, lack of lubrication, contamination), or loose mechanical components. ' +
      'Each cause produces a distinct vibration signature in frequency analysis.',
    topic: 'vibration_causes',
    source_reference:
      'ISO 10816-3, general troubleshooting (industrialmonitordirect.com)',
  },
  {
    chunk_text:
      'Bearing degradation manifests as increasing vibration at specific frequencies (BPFO, BPFI, BSF). ' +
      'Early detection allows scheduling maintenance before catastrophic failure. A motor in warning zone ' +
      '(1.8-4.5 mm/s) due to bearings typically has 2-4 weeks before reaching critical if not addressed.',
    topic: 'bearing_degradation',
    source_reference: 'ISO 10816-3, bearing analysis (researchgate.net)',
  },
  {
    chunk_text:
      'Mechanical imbalance causes vibration predominantly at 1× the rotational frequency. ' +
      'It can be caused by deposit buildup, erosion, broken fan blades, or manufacturing defects. ' +
      'Correction requires dynamic balancing with the rotor in place or removed.',
    topic: 'imbalance_diagnosis',
    source_reference: 'ISO 10816-3, vibration diagnostics',
  },

  // Temperature - NEMA MG-1
  {
    chunk_text:
      'Per NEMA MG-1, Class B insulation motors have a maximum winding temperature of 130°C ' +
      '(40°C ambient + 80°C allowed rise + 10°C hot spot). The SURFACE temperature measured by ' +
      'external sensors (thermocouple/DS18B20) is typically 30°C lower than internal winding temperature. ' +
      'Therefore, surface healthy max ≤70°C, warning 70-90°C, critical >90°C.',
    topic: 'temperature_thresholds',
    source_reference: 'NEMA MG-1, Class B insulation (engineeringtoolbox.com)',
  },
  {
    chunk_text:
      'Every 10°C of sustained excess over the insulation class rating reduces motor lifespan by ' +
      'approximately 50% (Arrhenius rule). This exponential degradation is why temperature critical zone ' +
      'triggers immediate action rather than just an alert — the damage accumulates rapidly.',
    topic: 'temperature_degradation',
    source_reference: 'NEMA MG-1, thermal aging (engineeringtoolbox.com)',
  },
  {
    chunk_text:
      'High motor surface temperature can be caused by: overload (drawing excessive current), ' +
      'poor ventilation (blocked cooling fins, failed cooling fan), high ambient temperature, ' +
      'single-phasing (in 3-phase motors), or insulation breakdown creating hot spots. ' +
      'The first check should be current draw — if overcurrent correlates with overtemperature, ' +
      'the root cause is likely mechanical overload.',
    topic: 'temperature_causes',
    source_reference: 'NEMA MG-1, motor troubleshooting',
  },

  // Current
  {
    chunk_text:
      'Motor current thresholds are based on the nameplate rated current (rated_current_a): ' +
      'healthy ≤1.05× rated (normal operation with small margin), warning 1.05-1.3× rated ' +
      '(probable mechanical overload, investigate cause), critical >1.3× rated (immediate action, ' +
      'risk of thermal damage). These are de facto standard ratios in motor protection.',
    topic: 'current_thresholds',
    source_reference: 'Motor protection standards, rated current margins',
  },
  {
    chunk_text:
      'Overcurrent in motors indicates the motor is drawing more power than designed for. ' +
      'Common causes: mechanical overload (jammed or heavy load), bearing failure (increased friction), ' +
      'voltage imbalance or undervoltage (motor compensates by drawing more current), ' +
      'or internal winding fault (short circuits between turns).',
    topic: 'overcurrent_causes',
    source_reference: 'Motor protection standards, overcurrent diagnosis',
  },
  {
    chunk_text:
      'When vibration and current are both elevated simultaneously, the most likely cause is ' +
      'mechanical: the motor is fighting against excessive load or friction, which manifests as both ' +
      'vibration (mechanical stress) and overcurrent (electrical compensation). This correlation ' +
      'strengthens the diagnosis and increases urgency of intervention.',
    topic: 'correlation_vibration_current',
    source_reference: 'Multi-parameter motor diagnostics',
  },

  // State machine behavior
  {
    chunk_text:
      'The automatic restart protocol uses a 100-second anti-short-cycle timer (minimum for small ' +
      'motors per protection standards). Only 1 automatic restart attempt is allowed per episode. ' +
      'If the anomaly recurs after restart, the motor transitions to "disabled" requiring manual ' +
      'intervention. This prevents repeated thermal stress from rapid start-stop cycles.',
    topic: 'restart_protocol',
    source_reference:
      'Anti-short-cycle protection (ICM Controls, patent references)',
  },
  {
    chunk_text:
      'A motor entering "under_review" state means the evaluation system detected either: ' +
      '5 out of 8 consecutive readings in warning zone (sustained anomaly over 2 minutes), or ' +
      'a single reading in critical zone (immediate danger). The 2-minute escalation window ' +
      'allows operators to intervene before automatic restart is triggered.',
    topic: 'under_review_explanation',
    source_reference:
      'System state machine design (docs/04-anomaly-state-machine.md)',
  },
  {
    chunk_text:
      'Sensor fault states are independent from motor health evaluation. A sensor in "fault" or ' +
      '"fault_persistent" state has its readings excluded from motor evaluation — the motor is ' +
      'assessed only by healthy sensors. If all 3 sensors are in fault simultaneously, the motor ' +
      'transitions to "under_review" with type "sensor_failure_widespread" (cannot trust any data).',
    topic: 'sensor_fault_independence',
    source_reference:
      'System state machine design (docs/04-anomaly-state-machine.md)',
  },

  // Sensor fault types
  {
    chunk_text:
      'Sensor fault detection types: "out_of_range" means the reading is physically impossible ' +
      '(outside plausible_min/max — e.g., negative temperature or vibration beyond equipment capability). ' +
      '"stuck" means the same value (rounded to 1 decimal) repeated for 20 consecutive readings (5 minutes). ' +
      '"disconnected" means no data received within the grace window (20s for WiFi, 5s for LAN connections).',
    topic: 'sensor_fault_types',
    source_reference:
      'System sensor state machine (docs/04-anomaly-state-machine.md)',
  },

  // Maintenance recommendations
  {
    chunk_text:
      'Recommended maintenance actions by alert type: For sustained vibration warning — schedule ' +
      'vibration analysis (frequency spectrum) within 1-2 weeks; check alignment, bearing condition, ' +
      'and balance. For temperature warning — check ventilation, measure current draw, inspect for ' +
      'blocked cooling. For overcurrent — verify mechanical load, check for jammed components, ' +
      'measure phase voltages for imbalance.',
    topic: 'maintenance_recommendations',
    source_reference: 'General industrial maintenance best practices',
  },
  {
    chunk_text:
      'When a motor is disabled (failed automatic restart), the operator should: 1) Check the alert ' +
      'history to understand what triggered the original escalation. 2) Physically inspect the motor ' +
      'and connected equipment. 3) Verify sensor health (a stuck or faulty sensor might have caused ' +
      'false readings before being detected as fault). 4) Only re-enable after confirming the root ' +
      'cause is addressed.',
    topic: 'disabled_motor_procedure',
    source_reference: 'System operational procedures',
  },

  // State reference for operators (Spanish context)
  {
    chunk_text:
      'Los estados del motor son: "Saludable" (operación normal), "En revisión" (anomalía detectada, ' +
      'el sistema espera 2 minutos antes de actuar), "Deteniendo" (comando de parada enviado), ' +
      '"Reiniciando" (ciclo de 100 segundos), "Deshabilitado" (anomalía persistió tras reinicio, ' +
      'requiere inspección física y reactivación manual), "Parada manual" (detenido por un operador).',
    topic: 'motor_states_reference',
    source_reference: 'Sistema de telemetría - Referencia de estados',
  },
  {
    chunk_text:
      'Los estados del sensor son: "Normal" (valores válidos), "Falla" (fuera de rango, atascado, ' +
      'o desconectado — se reintentará automáticamente en 5 segundos), "Falla persistente" (el sensor ' +
      'falló nuevamente tras reinicio automático, requiere reemplazo o recalibración manual). ' +
      'Las lecturas de un sensor en falla NO participan en la evaluación de salud del motor.',
    topic: 'sensor_states_reference',
    source_reference: 'Sistema de telemetría - Referencia de estados',
  },
  {
    chunk_text:
      'Tipos de alerta: "Advertencia" se genera con 5/8 lecturas anómalas o 1 lectura crítica. ' +
      '"Reinicio forzado" cuando el sistema reinicia automáticamente después de 2 minutos sin intervención. ' +
      '"Deshabilitado" cuando la anomalía persiste post-reinicio. "Falla general de sensores" cuando ' +
      'los 3 sensores del motor están en falla simultáneamente y no se puede evaluar su salud.',
    topic: 'alert_types_reference',
    source_reference: 'Sistema de telemetría - Referencia de estados',
  },
  {
    chunk_text:
      'Para detener un motor manualmente: el operador o admin presiona "Detener" en la vista de detalle ' +
      'del motor. Solo está disponible si el motor está "Saludable" o "En revisión". Para reiniciar: ' +
      'presionar "Reiniciar", disponible cuando el motor está "En revisión", "Parada manual" o "Deshabilitado". ' +
      'Ambas acciones envían comandos MQTT al ESP32 correspondiente.',
    topic: 'manual_commands_reference',
    source_reference: 'Sistema de telemetría - Referencia de operación',
  },
];
