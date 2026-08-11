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
      'A motor entering the "alarm" state means one of its sensors sustained N consecutive ' +
      'anomalous readings (readings above warning_max, N configurable per motor, default 5). ' +
      'When alarm triggers, a grace timer starts (configurable, default 2 minutes) during which ' +
      'the operator can intervene. If nobody acts, the system trips and restarts the motor. ' +
      'A single critical reading (above critical_max) triggers an immediate trip WITHOUT waiting ' +
      'for the grace timer. After a restart, a cooldown period (minimum 5 minutes) doubles the ' +
      'consecutive-readings threshold so the motor cannot trip again instantly.',
    topic: 'alarm_explanation',
    source_reference:
      'System state machine design (docs/04-anomaly-state-machine.md)',
  },
  {
    chunk_text:
      'Sensor fault states are independent from motor health evaluation. A sensor in "fault" or ' +
      '"fault_persistent" state has its readings excluded from motor evaluation — the motor is ' +
      'assessed only by healthy sensors. If all 3 sensors of a motor are in fault simultaneously, ' +
      'the motor cannot be evaluated at all, but the system does NOT change the motor status on ' +
      'its own in that scenario.',
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
      'Los estados del motor son: "Saludable" (operación normal), "Alarma" (anomalía detectada: ' +
      'N lecturas consecutivas anómalas; el sistema espera un periodo de gracia configurable, ' +
      'por defecto 2 minutos, antes de actuar; una lectura crítica dispara la parada inmediata), ' +
      '"Deteniendo" (comando de parada enviado), "Reiniciando" (ciclo de 100 segundos), ' +
      '"Deshabilitado" (anomalía persistió tras reinicio, requiere inspección física y reactivación ' +
      'manual), "Parada manual" (detenido por un operador).',
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
      'Tipos de alerta: "Alarma de motor" (N lecturas consecutivas anómalas; abre la ventana de gracia), ' +
      '"Trip forzado" (el sistema reinicia el motor automáticamente tras vencer la ventana de gracia sin ' +
      'intervención, o por una lectura crítica inmediata), "Motor deshabilitado" (la anomalía persiste ' +
      'post-reinicio, motor fuera de servicio), "Falla de sensor" (sensor fuera de rango, atascado o ' +
      'desconectado; se intenta un reinicio automático) y "Falla persistente de sensor" (el sensor falló ' +
      'nuevamente tras el reinicio automático, requiere intervención manual).',
    topic: 'alert_types_reference',
    source_reference: 'Sistema de telemetría - Referencia de estados',
  },
  {
    chunk_text:
      'Para detener un motor manualmente: el operador o admin presiona "Detener" en la vista de detalle ' +
      'del motor. Solo está disponible si el motor está "Saludable" o "Alarma". Para reiniciar: ' +
      'presionar "Reiniciar", disponible cuando el motor está "Alarma", "Parada manual" o "Deshabilitado". ' +
      'Ambas acciones envían comandos MQTT al ESP32 correspondiente.',
    topic: 'manual_commands_reference',
    source_reference: 'Sistema de telemetría - Referencia de operación',
  },

  // ── Diagnóstico multi-sensor ─────────────────────────────────────────
  {
    chunk_text:
      'Si TODOS los sensores de un motor (temperatura, vibración y corriente) entran en estado de falla ' +
      'al mismo tiempo, la causa más probable NO son tres fallas físicas independientes de sensores sino ' +
      'un problema de COMUNICACIÓN o del microcontrolador (ESP32): corte de WiFi/LAN, reinicio del ESP32, ' +
      'o pérdida de alimentación del módulo. El sistema marca "sin datos recientes" y deja de evaluar el ' +
      'motor; los valores que se muestran son los últimos recibidos antes del corte (congelados). ' +
      'Procedimiento: verificar primero la conexión y alimentación del ESP32, el router/punto de acceso y ' +
      'el cableado LAN; recién después sospechar de sensores individuales.',
    topic: 'all_sensors_fault_communication',
    source_reference: 'Diagnóstico operativo - falla simultánea de sensores',
  },
  {
    chunk_text:
      'Durante un reinicio del ESP32 (p. ej. tras un trip forzado por sobrecorriente), el motor deja de ' +
      'enviar lecturas por unos segundos a minutos. El sistema puede marcar los sensores como "Falla" ' +
      'si no recibe datos dentro de la ventana de gracia (20s WiFi, 5s LAN). Al volver la comunicación, ' +
      'los sensores se recuperan solos. Si ves los 3 sensores en falla justo después de un trip o un ' +
      'reinicio, esperá a que el ESP32 reconecte antes de inspeccionar físicamente.',
    topic: 'esp32_restart_sensor_faults',
    source_reference: 'Diagnóstico operativo - reconexión ESP32',
  },
  {
    chunk_text:
      'Correlación vibración + corriente elevadas simultáneamente: es el patrón más típico de SOBRECARGA ' +
      'MECÁNICA. El motor "pelea" contra una carga atascada o con fricción creciente (rodamiento desgastado, ' +
      'impulsor obstruido, correa tensa o desalineada). La corriente sube porque el motor compensa el mayor ' +
      'par requerido, y la vibración sube por el esfuerzo mecánico. La urgencia es alta: continuar en este ' +
      'estado calienta el motor y daña el rodamiento rápidamente. Prioridad: aliviar la carga antes que ' +
      'mediciones finas.',
    topic: 'correlation_vibration_current_overload',
    source_reference: 'Diagnóstico multi-paramétrico de motores',
  },
  {
    chunk_text:
      'Correlación temperatura + corriente elevadas: indica sobrecarga de origen eléctrico o térmico ' +
      'sostenido. Si la corriente está sobre su valor nominal y la temperatura de superficie sube de forma ' +
      'constante, sospechar: sobrecarga real de la máquina accionada, tensión de alimentación desbalanceada ' +
      'o baja (el motor toma más corriente para compensar), o ventilación del motor obstruida. Medir las ' +
      'tensiones de línea con multímetro y la corriente por fase con pinza amperométrica.',
    topic: 'correlation_temperature_current',
    source_reference: 'Diagnóstico multi-paramétrico de motores',
  },
  {
    chunk_text:
      'Correlación temperatura + vibración elevadas sin corriente alta: sugiere problema mecánico con ' +
      'fricción térmica localizada, típicamente rodamiento en avanzado desgaste o desalineación fuerte. ' +
      'El rodamiento genera calor por fricción y vibración por holgura/defecto. Verificar temperatura en ' +
      'cajas de rodamiento con termografía o contacto, y programar análisis de vibración con espectro ' +
      'para confirmar BPFO/BPFI/BSF.',
    topic: 'correlation_temperature_vibration',
    source_reference: 'Diagnóstico multi-paramétrico de motores',
  },

  // ── Rodamientos ───────────────────────────────────────────────────────
  {
    chunk_text:
      'Fallas de rodamiento en motores eléctricos: fatiga por vida útil, lubricación deficiente o excesiva, ' +
      'contaminación (polvo, humedad), desalineación, holgura de montaje, y paso de corriente eléctrica ' +
      '(fluting). El análisis de espectro identifica la etapa por frecuencias: BPFO (defecto en pista ' +
      'exterior), BPFI (pista interior), BSF (elemento rodante), FTF (jaula). Una falla incipiente avanza ' +
      'lentamente al inicio y acelera al final; detectarla temprano permite programar el cambio.',
    topic: 'bearing_failure_modes',
    source_reference: 'ISO 10816-3 / ISO 13373, análisis de rodamientos',
  },
  {
    chunk_text:
      'Regla práctica de rodamientos: si la vibración global (RMS) crece de forma constante y sostenida ' +
      'en varias mediciones, aunque esté bajo el umbral de advertencia, es señal de rodamiento degradándose. ' +
      'Un incremento superior al 25% entre mediciones consecutivas (misma velocidad y carga) justifica ' +
      'programar análisis de espectro y preparar repuesto. La lubricación preventiva con la grasa adecuada ' +
      'y la cantidad correcta (no sobrelubricar) extiende la vida del rodamiento.',
    topic: 'bearing_trend_rule',
    source_reference: 'Mantenimiento predictivo - tendencias',
  },
  {
    chunk_text:
      'Desalineación vs desbalance: la desalineación de acoplamiento produce vibración predominante a 2× ' +
      'la velocidad de giro (y armónicos), además de axial; el desbalance produce vibración dominante a 1× ' +
      'la velocidad de giro, radial y estable. Para distinguirlos sin espectro: el desbalance no cambia con ' +
      'la alineación y el axial suele ser bajo; la desalineación genera axial alto y se agrava con la carga. ' +
      'Corrección: alinear el acoplamiento con comparador de carátula o láser; balancear el rotor en sitio ' +
      'o en taller.',
    topic: 'misalignment_vs_unbalance',
    source_reference: 'ISO 10816 / ISO 11342, diagnóstico de vibraciones',
  },

  // ── Fallas eléctricas ─────────────────────────────────────────────────
  {
    chunk_text:
      'Fase abierta (single-phasing) en motor trifásico: si una fase se interrumpe (fusible quemado, ' +
      'contacto flojo, cable cortado), el motor trifásico sigue girando con dos fases pero toma corriente ' +
      'elevada en las fases restantes, vibra más, hace ruido y se calienta rápidamente. Si no se detiene ' +
      'a tiempo, quema el bobinado. Síntomas: corriente muy desbalanceada entre fases, temperatura en ' +
      'aumento con carga normal, zumbido. Verificar con pinza amperométrica las tres fases y medir ' +
      'tensión entre fases en el arrancador y en el motor.',
    topic: 'single_phasing',
    source_reference: 'Protección de motores trifásicos (NEMA MG-1, IEC 60034)',
  },
  {
    chunk_text:
      'Rotor bloqueado o carga atascada: la corriente sube a 5-8 veces la nominal en segundos y el motor ' +
      'se calienta muy rápido (el calor no tiene tiempo de disiparse). Si el motor no arranca o se detiene ' +
      'de golpe con corriente muy alta y zumbido, sospechar carga atascada (bomba atascada, correa trabada, ' +
      'impulsor bloqueado). Detener de inmediato y desacoplar la carga para confirmar que el motor gira ' +
      'libre antes de probar de nuevo.',
    topic: 'locked_rotor',
    source_reference: 'Protección de motores - rotor bloqueado',
  },
  {
    chunk_text:
      'Desbalance de tensión: el desbalance entre fases (máxima desviación sobre el promedio, en %) ' +
      'degrada el motor aunque la corriente nominal no se supere. Por cada 1% de desbalance de tensión, ' +
      'el motor puede ver un aumento de temperatura de varios grados (NEMA recomienda no operar sobre 5% ' +
      'de desbalance y de-ratar el motor). Causas: cargas monofásicas desbalanceadas en el tablero, ' +
      'contactos flojos, caída de tensión desigual en las líneas. Medir tensión entre fases con el motor ' +
      'en carga.',
    topic: 'voltage_imbalance',
    source_reference: 'NEMA MG-1 - desbalance de tensión',
  },
  {
    chunk_text:
      'Baja tensión (undervoltage): si la tensión de alimentación cae por debajo del nominal, el motor ' +
      'compensa tomando MÁS corriente para mantener el par, por lo que la corriente puede superar el ' +
      'nominal sin que exista sobrecarga mecánica. Un motor de inducción no "hace de menos" con baja ' +
      'tensión: consume más amperes y se calienta. Ante corriente alta con vibración normal y tensión ' +
      'baja, revisar la red eléctrica antes que el motor.',
    topic: 'undervoltage_overcurrent',
    source_reference: 'Protección de motores - baja tensión',
  },
  {
    chunk_text:
      'Clases de aislamiento y límites de temperatura (NEMA/IEC): Clase A 105°C, Clase B 130°C, ' +
      'Clase F 155°C, Clase H 180°C (temperatura total del bobinado, incluyendo 40°C de ambiente). ' +
      'Regla del 10°C (Arrhenius): por cada 10°C de exceso sostenido sobre la clase, la vida del ' +
      'aislamiento se reduce aproximadamente a la mitad. Por eso una temperatura de superficie estable ' +
      'elevada es grave aunque el motor siga funcionando.',
    topic: 'insulation_classes',
    source_reference: 'NEMA MG-1 / IEC 60085 - clases de aislamiento',
  },

  // ── Corriente y arranque ───────────────────────────────────────────────
  {
    chunk_text:
      'Corriente de arranque: al arrancar, un motor de inducción toma típicamente 5-8 veces la corriente ' +
      'nominal durante 1-3 segundos (DOL) o menos si usa arrancador suave/estrella-triángulo. Las lecturas ' +
      'altas aisladas durante el arranque son normales y no deben alarmar; lo que indica problema es ' +
      'corriente alta SOSTENIDA en régimen. Factor de servicio (SF): un motor con SF 1.15 puede operar ' +
      'continuamente hasta 1.15× nominal sin reducir su vida, pero NUNCA debe excederse el SF por periodos ' +
      'prolongados.',
    topic: 'inrush_and_service_factor',
    source_reference: 'NEMA MG-1 - arranque y factor de servicio',
  },
  {
    chunk_text:
      'Arrancadores: a tensión plena (DOL) el motor arranca a par y corriente máximos; estrella-triángulo ' +
      'reduce la corriente de arranque a ~1/3 pero reduce también el par (~1/3), solo apto para arranque ' +
      'en vacío o carga ligera; arrancador suave (soft-start) y variador de frecuencia (VFD) limitan ' +
      'corriente y controlan el par. Si el sistema registra picos de corriente al arrancar y el motor usa ' +
      'DOL, son esperables lecturas muy superiores a la nominal en esos instantes.',
    topic: 'motor_starters',
    source_reference: 'NEMA/IEC - métodos de arranque',
  },
  {
    chunk_text:
      'Corriente en vacío vs plena carga: un motor de inducción en vacío toma típicamente 30-50% de su ' +
      'corriente nominal (la corriente magnetizante). Si un motor consume mucho más de lo esperado para su ' +
      'carga, sospechar: desalineación, rodamientos desgastados, tensión desbalanceada, o bobinado dañado ' +
      '(cortocircuito entre espiras). La relación corriente/carga útil es la herramienta más rápida para ' +
      'distinguir problema mecánico de eléctrico.',
    topic: 'noload_current_diagnosis',
    source_reference: 'Diagnóstico por corriente de motor',
  },

  // ── Mantenimiento predictivo y seguridad ──────────────────────────────
  {
    chunk_text:
      'Mantenimiento predictivo por tendencias: registrar periódicamente (diario o semanal) vibración RMS, ' +
      'temperatura de superficie y corriente de cada motor permite detectar degradación incipiente. ' +
      'Indicadores: vibración creciendo más de 25% entre mediciones, temperatura de superficie subiendo ' +
      'de forma constante hacia el umbral de advertencia, o corriente que crece con carga constante. ' +
      'Actuar sobre la tendencia (revisar en la próxima parada) en lugar de esperar la falla.',
    topic: 'predictive_maintenance_trends',
    source_reference: 'ISO 13373 - mantenimiento basado en condición',
  },
  {
    chunk_text:
      'Seguridad antes de inspeccionar un motor (LOTO - Lockout/Tagout): si el motor está deshabilitado o ' +
      'requiere inspección física, bloquear la alimentación del arrancador/tablero, verificar ausencia de ' +
      'tensión con multímetro, y colocar candado y tarjeta. No abrir cajas de conexión, no retirar ' +
      'protecciones ni tocar bobinados con el motor energizado. El capacitor de arranque y los variadores ' +
      'pueden retener tensión: esperar 5 minutos antes de trabajar.',
    topic: 'loto_safety',
    source_reference: 'NFPA 70E / OSHA - seguridad eléctrica',
  },
  {
    chunk_text:
      'Checklist de inspección visual de un motor: 1) Limpieza de aletas y rejillas de ventilación ' +
      '(bloqueadas → sobrecalentamiento). 2) Fugas de grasa en cajas de rodamiento. 3) Ruido anormal ' +
      '(zumbido, rechinido, golpeteo). 4) Vibración visible en la base o acoplamiento. 5) Estado de ' +
      'cableado y bornera (quemaduras, aflojamiento, decoloración por calor). 6) Tornillería de fijación ' +
      'y nivelación de la base. 7) Correas: tensión, alineación y desgaste. 8) Temperatura al tacto ' +
      '(cuidado: puede estar muy caliente).',
    topic: 'visual_inspection_checklist',
    source_reference: 'Buenas prácticas de mantenimiento de motores',
  },
  {
    chunk_text:
      'Herramientas de medición eléctrica: pinza amperométrica para corriente por fase (medir en las tres ' +
      'fases y comparar), multímetro para tensión entre fases (U12, U23, U31) y continuidad, y megóhmetro ' +
      '(megger) para resistencia de aislamiento del bobinado contra tierra (medir con el motor desenergizado, ' +
      'valores típicamente >1 MΩ a 500V; menores indican humedad o deterioro del aislamiento). Los valores ' +
      'de corriente y tensión se deben tomar con el motor en carga estable.',
    topic: 'electrical_measurement_tools',
    source_reference: 'Prácticas de medición eléctrica en motores',
  },
  {
    chunk_text:
      'Componentes accionados por el motor: bombas, ventiladores, compresores, molinos y correas tienen ' +
      'fallas propias que se reflejan en el motor. Bomba con cavitación: vibración de banda ancha y ' +
      'corriente fluctuante, ruido de "grava". Ventilador con impulsor sucio o desbalanceado: vibración ' +
      'a 1× (impulsor) creciente con el tiempo. Molino/grinder: la abrasión del material desgasta y ' +
      'desbalancea el rotor y el impulsor; vigilar vibración 1× y corriente por sobrecarga. Una falla en ' +
      'la máquina accionada SIEMPRE se refleja en el motor: no diagnosticar solo el motor.',
    topic: 'driven_equipment_faults',
    source_reference: 'Diagnóstico de equipos accionados',
  },
  {
    chunk_text:
      'Ruidos anormales del motor: zumbido fuerte = desbalance de tensión, fase abierta, o bobinado ' +
      'dañado; rechinido metálico = rodamiento en falla avanzada o contacto rotor-estátor; golpeteo rítmico ' +
      '= rodamiento o desalineación; silbido agudo = ventilación obstruida o holgura de rodamiento. ' +
      'Comparar con el ruido normal de operación: un cambio de carácter del ruido es un indicador ' +
      'temprano tan válido como los valores numéricos.',
    topic: 'motor_noise_diagnostics',
    source_reference: 'Diagnóstico acústico de motores',
  },
  {
    chunk_text:
      'Causas de alta temperatura de superficie en el motor: sobrecarga (corriente alta sostenida), ' +
      'ventilación obstruida (aletas sucias, ventilador de enfriamiento roto), temperatura ambiente ' +
      'elevada, ciclo de trabajo demasiado intenso, fase abierta, o rodamientos en falla por fricción. ' +
      'Para discriminar: medir corriente (si está normal, el problema es ventilación/ambiente); medir ' +
      'vibración (si sube, sospechar rodamiento); verificar que las aletas y el ventilador estén limpios ' +
      'y girando.',
    topic: 'high_temperature_causes_checklist',
    source_reference: 'NEMA MG-1 - causas de sobrecalentamiento',
  },
  {
    chunk_text:
      'Ventilación y enfriamiento: los motores cerrados (TEFC) disipan el calor por las aletas exteriores ' +
      'y un ventilador acoplado al eje. Un ventilador de enfriamiento roto o aletas cubiertas de polvo ' +
      'pueden elevar la temperatura de superficie 20-30°C sin cambio en la corriente. La limpieza de las ' +
      'aletas con aire comprimido o cepillo (motor detenido y desenergizado) es mantenimiento preventivo ' +
      'de bajo costo y alto impacto.',
    topic: 'motor_cooling_ventilation',
    source_reference: 'Buenas prácticas - enfriamiento de motores',
  },
  {
    chunk_text:
      'Vibración 1× (una vez por revolución) alta con corriente normal: típicamente DESBALANCE del rotor ' +
      'o de la pieza acoplada (impulsor, polea). Causas: acumulación de suciedad en el impulsor, paletas ' +
      'rotas o erosionadas, masa de balanceo perdida, o rotor deformado. La corrección es balanceo ' +
      'dinámico. En equipos de proceso (molinos, grinder, ventiladores), la acumulación de material en ' +
      'el impulsor es la causa más frecuente y se resuelve limpiándolo.',
    topic: 'vibration_1x_imbalance',
    source_reference: 'ISO 10816 - vibración a 1× velocidad',
  },
  {
    chunk_text:
      'Holgura mecánica: vibración con armónicos múltiples (1×, 2×, 3×...) y picos a fracciones de la ' +
      'velocidad puede indicar holgura en la base, en el rodamiento, en el acoplamiento o en los pernos ' +
      'de fijación. Síntoma típico: vibración que cambia bruscamente al variar la carga y presencia de ' +
      'muchos armónicos en el espectro. Verificar apriete de pernos, nivelación de la base, y asiento del ' +
      'rodamiento en la caja.',
    topic: 'mechanical_looseness',
    source_reference: 'ISO 10816 - diagnóstico de holguras',
  },
  {
    chunk_text:
      'Mantenimiento programado de un motor deshabilitado: 1) Revisar el historial de alertas para ' +
      'entender qué disparó el trip (qué sensor y qué valor). 2) Confirmar que los sensores reportaron ' +
      'datos confiables antes del evento (una lectura anómala por sensor en falla pudo causar el trip ' +
      'falso). 3) Inspección física y eléctrica completa (ver checklist). 4) Corregir la causa raíz. ' +
      '5) Recién entonces reactivar el motor y monitorear de cerca las primeras horas.',
    topic: 'disabled_motor_recovery_procedure',
    source_reference: 'Procedimientos operativos del sistema',
  },
  {
    chunk_text:
      'Priorización de urgencia según umbral: un valor por encima de critical_max requiere acción ' +
      'INMEDIATA (el sistema hace trip automático); un valor en zona de advertencia sostenido permite ' +
      'planificar intervención en días, pero si además hay tendencia creciente, acortar los plazos. ' +
      'Cuando varios sensores están simultáneamente en alarma, atender primero el que esté más cerca de ' +
      'su umbral crítico y revisar la causa común (comunicación, carga, alimentación).',
    topic: 'urgency_prioritization',
    source_reference: 'Lógica de operación del sistema',
  },
  {
    chunk_text:
      'Valores de referencia del sistema: para CORRIENTE los umbrales se calculan como la corriente ' +
      'nominal del motor por multiplicadores (saludable ≤1.05×, advertencia ≤1.15×, crítico >1.3×). ' +
      'Para TEMPERATURA de superficie: saludable ≤70°C, advertencia 70-90°C, crítico >90°C (clase B). ' +
      'Para VIBRACIÓN: saludable ≤1.8 mm/s, advertencia 1.8-4.5 mm/s, crítico >4.5 mm/s (ISO 10816-3 ' +
      'Clase I). Los umbrales específicos de cada motor pueden sobreescribirse en configuración.',
    topic: 'system_reference_values',
    source_reference: 'Sistema de telemetría - valores de referencia',
  },
];
