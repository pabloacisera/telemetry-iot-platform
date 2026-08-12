/**
 * Knowledge base fragments for the RAG module.
 * Each fragment is grounded in ISO/NEMA standards and cites its source.
 * These are vectorized and stored in MongoDB's `embeddings` collection.
 */
export const KNOWLEDGE_FRAGMENTS = [
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
  {
    chunk_text:
      'Estadísticas de fallas en motores de inducción (estudios IEEE e EPRI): los RODAMIENTOS son la ' +
      'causa nº1, 41-44% de las fallas; el BOBINADO del estator es la nº2, 26-36%; el rotor el 9-13%. ' +
      'En conjunto, rodamientos + bobinado explican ~70% de todas las fallas. En nuestro sistema, el ' +
      'monitoreo de VIBRACIÓN detecta rodamientos y el de CORRIENTE+TEMPERATURA detecta bobinado. ' +
      'Si solo pudieras mirar dos sensores de un motor, vibración y corriente cubren las dos causas ' +
      'de falla más frecuentes.',
    topic: 'motor_failure_statistics',
    source_reference:
      'Estudios IEEE-IAS y EPRI de fallas de motores (reliamag.com)',
  },
  {
    chunk_text:
      'La desalineación de acoplamiento motor-carga es el mayor contribuyente individual a las paradas ' +
      'en bombas industriales: ~28% de las fallas en trenes motor-bomba. Aunque el sensor de vibración ' +
      'del motor registre valores en zona de advertencia, la causa suele estar en el ACOPLAMIENTO o en la ' +
      'máquina accionada, no en el motor. Ante vibración a 2× la velocidad de giro (o axial elevada) ' +
      'sospechar desalineación y verificar el acoplamiento antes de cambiar rodamientos del motor.',
    topic: 'misalignment_statistics',
    source_reference: 'IntechOpen - fallas en motores de inducción en bombas',
  },
  {
    chunk_text:
      'El DS18B20 es un sensor digital de temperatura sobre bus 1-Wire, con exactitud de ±0.5°C en el ' +
      'rango -10°C a +85°C y medición de -55°C a +125°C. Resolución programable de 9 a 12 bits ' +
      '(0.5°C a 0.0625°C). Cada dispositivo tiene un código serial único de 64 bits, por lo que varios ' +
      'sensores pueden compartir un mismo cable de datos. Requiere una resistencia pull-up de 4.7 kΩ ' +
      'en la línea de datos. Puede funcionar hasta ~100 m de cable con par trenzado.',
    topic: 'ds18b20_specs',
    source_reference:
      'Maxim Integrated DS18B20 datasheet (sparkfun.com, circuitbasics.com)',
  },
  {
    chunk_text:
      'Comportamiento conocido del DS18B20: al encender o cuando la conversión no terminó, devuelve ' +
      'un valor de 85.00°C (constante de power-on reset). Si el sistema muestra EXACTAMENTE 85.0°C de ' +
      'forma sostenida o tras una reconexión, no es necesariamente una temperatura real: puede ser un ' +
      'sensor que acaba de reencender, un problema de cableado (corto o abierto) o un error de ' +
      'comunicación 1-Wire. Verificar el cableado y la lectura repetida antes de disparar alarmas ' +
      'térmicas. En nuestro sistema, una lectura "atascada" en 85.0 suele detectarse como sensor en ' +
      'estado stuck por el algoritmo de valores repetidos.',
    topic: 'ds18b20_85c_quirk',
    source_reference:
      'DS18B20 datasheet / avrfreaks.net (quirk de power-on reset)',
  },
  {
    chunk_text:
      'Errores de cableado del DS18B20: con el sensor en circuito abierto o sin comunicación, el ' +
      'microcontrolador puede leer -127°C o 85.0°C (valores de falla típicos), o un valor transitorio. ' +
      'Si la temperatura reportada es -127, 85.0 o fuera del rango plausible del motor, sospechar ' +
      'primero cableado/conector del sensor y no una falla térmica real del motor. El sistema marca ' +
      'estos valores como "out_of_range" y excluye el sensor de la evaluación del motor.',
    topic: 'ds18b20_wiring_errors',
    source_reference:
      'DS18B20 open circuit behavior (avrfreaks.net, circuitbasics.com)',
  },
  {
    chunk_text:
      'Frecuencias características de rodamientos: BPFO (paso de defecto por pista EXTERIOR), BPFI ' +
      '(pista INTERIOR), BSF (elemento rodante) y FTF (jaula). Valores típicos en motores pequeños: ' +
      'BPFO ≈ 3-5× la velocidad de giro, BPFI ≈ 5-7× la velocidad de giro. Un defecto en la pista ' +
      'exterior produce un golpeteo rítmico de ~4 golpes por revolución; en la pista interior de ~6. ' +
      'El espectro de vibración identifica cuál pista está dañada y permite programar el cambio.',
    topic: 'bearing_frequencies_bpfo_bpfi',
    source_reference:
      'Análisis de vibraciones de rodamientos (ISO 13373, vibromera.eu)',
  },
  {
    chunk_text:
      'Regla práctica: si la vibración de rodamientos (BPFO/BPFI) o la vibración global RMS crece ' +
      '>25% entre mediciones consecutivas con la misma carga y velocidad, la falla está avanzando. ' +
      'La vibración por rodamiento SUELTA ES DEPENDIENTE DE LA CARGA: aumenta al subir la carga, a ' +
      'diferencia del desbalance y la desalineación, que no cambian mucho con la carga. Si la ' +
      'vibración sube cuando la corriente sube, es probable causa mecánica (rodamiento/carga); si ' +
      'sube sin relación con la carga, sospechar desbalance o problema eléctrico.',
    topic: 'bearing_load_dependence',
    source_reference:
      'Vibromera.eu / UQAM - dependencia de la vibración con la carga',
  },
  {
    chunk_text:
      'Motores con VARIADOR (VFD) y enfriamiento por ventilador acoplado al eje (TEFC): a baja ' +
      'velocidad (<50% de la nominal) el ventilador de eje gira lento y la capacidad de enfriamiento ' +
      'cae drásticamente (hasta la mitad o menos). Un motor TEFC operado a velocidad reducida con par ' +
      'constante puede SOBRECALENTARSE aunque la corriente esté dentro del nominal. En estos casos se ' +
      'requiere ventilación forzada independiente o reducir la carga. Si el sistema ve temperatura de ' +
      'superficie subiendo en un motor a baja velocidad con corriente normal, la causa es enfriamiento ' +
      'insuficiente, no sobrecarga.',
    topic: 'vfd_low_speed_cooling',
    source_reference:
      'ECdesign.com / prácticas VFD - enfriamiento a baja velocidad',
  },
  {
    chunk_text:
      'Corriente de eje y fluting en rodamientos con VFD: los motores alimentados por variador pueden ' +
      'tener tensión de eje y corrientes inducidas que descargan a través del rodamiento, creando ' +
      'marcas de fluting (estrías tipo "lavadero") en las pistas y falla prematura. Mitigaciones: ' +
      'rodamientos aislados, escobillas/anillos de puesta a tierra del eje. Si un motor con VFD falla ' +
      'repetidamente por rodamientos, considerar este mecanismo aunque la vibración y lubricación ' +
      'estén bien.',
    topic: 'vfd_shaft_current_fluting',
    source_reference: 'Fluke - daño de rodamientos por fluting (VFD)',
  },
  {
    chunk_text:
      'CAVITACIÓN en bombas: ocurre cuando la presión en la succión cae por debajo de la presión de ' +
      'vapor del líquido; el líquido hierve formando burbujas que implotan al llegar al impulsor. ' +
      'Síntomas: ruido como de "piedras o grava" pasando por la bomba, corriente del motor ' +
      'FLUCTUANTE (la aguja del amperímetro oscila), vibración de banda ancha. La cavitación prolongada ' +
      'erosiona el impulsor y destruye la bomba. Ante este patrón verificar: colador/filtro de succión ' +
      'obstruido, válvula de succión cerrada o parcial, nivel bajo en el tanque, o tubería de succión ' +
      'demasiado pequeña.',
    topic: 'pump_cavitation',
    source_reference: 'EngineeringToolbox - cavitación en bombas',
  },
  {
    chunk_text:
      'FALLAS EN LA MÁQUINA ACCIONADA: una bomba, ventilador, compresor o molino tiene fallas propias ' +
      'que SIEMPRE se reflejan en el motor. Bomba con cavitación (corriente fluctuante + ruido de ' +
      'grava). Ventilador con impulsor sucio o desbalanceado (vibración a 1× del ventilador creciente). ' +
      'Sello mecánico en falla (fuga, ruido agudo, calor en la zona del sello — es la causa nº1 de ' +
      'falla en bombas). Compresor con válvulas dañadas (temperatura de descarga alta, corriente ' +
      'elevada, pulsación de vibración). Ante un patrón anómalo, verificar primero la máquina accionada, ' +
      'no solo el motor.',
    topic: 'driven_equipment_faults_extended',
    source_reference:
      'Análisis de vibraciones de máquinas típicas (vibromera.eu, marchpump.com)',
  },
  {
    chunk_text:
      'Frecuencia de paso de paletas (BPF) en ventiladores: BPF = número de paletas × velocidad de ' +
      'giro. Vibración alta a la BPF indica paletas dañadas, sucias o desalineadas, o resonancia cerca ' +
      'de la BPF. La acumulación de suciedad en las paletas del ventilador causa DESBALANCE (vibración ' +
      'a 1×) y puede elevar la BPF; la limpieza del impulsor suele resolver ambos. En un ventilador ' +
      'con filtro obstruido, además sube la corriente porque el motor trabaja contra más resistencia.',
    topic: 'fan_blade_pass_frequency',
    source_reference:
      'Vibromera.eu - blade pass frequency / fallas en ventiladores',
  },
  {
    chunk_text:
      'ROTOR BLOQUEADO o motor trabado (stall): si el motor zumba y no arranca, o se detiene de golpe, ' +
      'la corriente sube a 5-8× la nominal en segundos. Causas: rodamiento agarrotado (fricción seca o ' +
      'grasa degradada >90°C), carga atascada (bomba/correa/impulsor trabado), acoplamiento roto. La ' +
      'sobrecarga térmica del arranque prolongado daña el bobinado rápido. Si el sistema detecta ' +
      'corriente muy alta y el motor no acelera, DETENER, desacoplar y girar el eje a mano para ' +
      'confirmar que gira libre antes de reintentar.',
    topic: 'stall_seized_bearing',
    source_reference:
      'Protección de motores - rotor bloqueado (electricaleasy.com, Eaton)',
  },
  {
    chunk_text:
      'Medición de RESISTENCIA DE AISLAMIENTO con megóhmetro (megger): regla general 1 MΩ por kV de ' +
      'tensión nominal (un motor de 400V debe tener al menos ~0.4-1 MΩ; la regla genérica exige ≥5 MΩ ' +
      'para dar por bueno). Valores orientativos: >100 MΩ = excelente; 30-100 MΩ = sospechoso, ' +
      'investigar; <30 MΩ = requiere secado/investigación; <5 MΩ = falla, NO operar. Medir con el motor ' +
      'desenergizado y DESCONECTADO del variador o arrancador (el VFD puede dañarse con la tensión del ' +
      'megger). La tendencia importa: una caída >25% respecto a la medición anterior justifica ' +
      'investigar aunque el valor absoluto siga siendo aceptable.',
    topic: 'megger_insulation_values',
    source_reference: 'Megger - pruebas de aislamiento en motores',
  },
  {
    chunk_text:
      'HUMEDAD y condensación: son las causas principales de baja resistencia de aislamiento. Motores ' +
      'que permanecen apagados en ambientes húmedos absorben humedad y pueden fallar en el PRIMER ' +
      'arranque tras un largo paro. Si un motor estuvo detenido mucho tiempo, medir el aislamiento ' +
      'antes de arrancar; si está bajo por humedad, secar con calefactores o corriente DC de baja ' +
      'tensión antes de operar. En nuestra planta, la temporada de humedad o ambientes fríos (cámaras ' +
      'frías) aumentan este riesgo.',
    topic: 'moisture_insulation',
    source_reference: 'Fluke / Megger - fallas por humedad en bobinados',
  },
  {
    chunk_text:
      'MEDICIÓN POR FASE con pinza amperométrica: medir la corriente de las TRES fases y compararlas. ' +
      'Un motor sano tiene corriente balanceada dentro de ±10% entre fases. Un desbalance de tensión ' +
      'del 1% produce típicamente 6-10% de desbalance de corriente. Si el desbalance de CORRIENTE es ' +
      'mayor que el de TENSIÓN, hay un problema interno del bobinado (típicamente cortocircuito entre ' +
      'espiras). NEMA recomienda NO operar con desbalance de tensión >5% y de-rata el motor desde 1%. ' +
      'Medir siempre las tres fases con el motor en carga estable.',
    topic: 'phase_measurement_balance',
    source_reference: 'Fluke - desbalance de corriente y tensión / NEMA MG-1',
  },
  {
    chunk_text:
      'FASE ABIERTA (single-phasing) en un motor TRIFÁSICO EN MARCHA: al perder una fase (fusible ' +
      'quemado, contacto flojo, cable cortado), el motor continúa girando con las dos fases restantes ' +
      'pero la corriente en ellas sube ~1.73× la nominal (factor √3), se calienta rápido, vibra más y ' +
      'zumba. Si no se detiene, quema el bobinado, típicamente en pocas horas o días. Síntomas en el ' +
      'sistema: corriente muy desbalanceada entre fases, temperatura subiendo con carga normal, ' +
      'zumbido. Detener, medir tensión entre fases en el tablero y en el motor, y revisar fusibles, ' +
      'contactores y borneras.',
    topic: 'single_phasing_173',
    source_reference:
      'Protección de motores - single phasing (NEMA MG-1, drandrewlong.com)',
  },
  {
    chunk_text:
      'Diferencia entre problema ELÉCTRICO y MECÁNICO en el motor: si la corriente es alta y la ' +
      'vibración también, es típicamente mecánico (sobrecarga, fricción de rodamiento). Si la corriente ' +
      'es alta y la vibración NORMAL, sospechar problema eléctrico (desbalance de tensión, baja tensión, ' +
      'bobinado con espiras cortas) o sobrecarga de la máquina accionada. Si la vibración es alta y la ' +
      'corriente normal, es mecánico sin sobrecarga (desbalance, desalineación, holgura, rodamiento ' +
      'inicial). Esta tabla de doble entrada orienta el diagnóstico en el panel del operador.',
    topic: 'electrical_vs_mechanical',
    source_reference: 'Fluke - troubleshooting de motores multi-paramétrico',
  },
  {
    chunk_text:
      'Tipos de falla de sensor según ISO 13374 (mapeo a nuestro sistema): "stuck" o valor congelado ' +
      '(el sensor entrega el mismo valor exacto durante largo tiempo — p. ej. 85.0°C en un DS18B20, ' +
      'un valor fijo en la vibración); "bias" (desvío constante); "drift" (deriva lenta); "out_of_range" ' +
      '(fuera de rango plausible) y "disconnected" (sin datos). El algoritmo del sistema ya detecta ' +
      'stuck (20 lecturas iguales = 5 min), out_of_range (fuera de plausible_min/max) y disconnected ' +
      '(sin datos en la ventana de gracia). Un valor de TEMPERATURA en 85.0°C exacto y constante es el ' +
      'patrón de stuck más común a observar en campo.',
    topic: 'sensor_fault_iso13374',
    source_reference: 'ISO 13374 - clasificación de fallas de sensores',
  },
  {
    chunk_text:
      'PINZA AMPEROMÉTRICA: medir la corriente abrazando UN SOLO conductor a la vez. Si se abraza ' +
      'más de un conductor (por ejemplo fase + retorno, o dos fases juntas), los campos magnéticos se ' +
      'cancelan y la lectura es cero o incorrecta. En un motor trifásico medir cada una de las tres ' +
      'fases individualmente. La exactitud típica de una pinza de efecto Hall es ±1-3% de la lectura; ' +
      'verificar que las mordazas cierren bien y calibrar a cero con las mordazas abiertas antes de medir.',
    topic: 'clamp_meter_technique',
    source_reference: 'Fluke - uso de pinza amperométrica (efecto Hall)',
  },
  {
    chunk_text:
      'CORRIENTE EN VACÍO: un motor de inducción en vacío toma típicamente 20-40% de la corriente ' +
      'nominal (30% típico), casi toda corriente magnetizante. Por lo tanto, la corriente NO es ' +
      'proporcional a la carga por debajo de ~60% de carga: un motor con carga ligera sigue tomando ' +
      'una fracción mínima de corriente. Si un motor opera con corriente muy superior a la esperada ' +
      'para su carga (comparar con el medidor), investigar: rodamientos, desalineación, tensión ' +
      'desbalanceada o bobinado dañado. Un desbalance de fase o problema de espiras se ve mejor con ' +
      'las tres fases medidas que con la suma.',
    topic: 'noload_current_30',
    source_reference: 'ElectricNeutron / Fluke - corriente en vacío del motor',
  },
  {
    chunk_text:
      'CICLO DE SERVICIO del motor (duty cycle): S1 = servicio continuo (funciona a carga constante ' +
      'tiempo suficiente para alcanzar temperatura de régimen — es el típico de procesos industriales); ' +
      'S2 = servicio de tiempo limitado (p. ej. S2-60min); S3 = periódico intermitente con arranque y ' +
      'reposo. Un motor dimensionado para S1 operado con paradas/arranques frecuentes (S3) se calienta ' +
      'más porque cada arranque disipa mucha energía en el bobinado. Si el sistema registra ciclos ' +
      'cortos repetidos de arranque-parada, verificar si el duty cycle del motor coincide con el uso real.',
    topic: 'motor_duty_cycle',
    source_reference: 'IEC 60034-1 - ciclos de servicio S1-S9',
  },
  {
    chunk_text:
      'FACTOR DE POTENCIA: un motor de inducción a plena carga tiene factor de potencia de 0.80-0.92; ' +
      'en vacío cae a 0.15-0.30. Un factor de potencia bajo no es un defecto del motor sino un síntoma ' +
      'de operación a baja carga. La compensación con capacitores reduce las pérdidas en el cableado ' +
      'pero NO mejora la eficiencia del motor. En el monitoreo, si la corriente es baja y el motor está ' +
      'poco cargado, es normal; si la corriente es alta con carga aparentemente baja, hay un problema ' +
      'real (rodamiento, bobinado, desbalance).',
    topic: 'power_factor_behavior',
    source_reference: 'ElectricalTechnology - factor de potencia de motores',
  },
  {
    chunk_text:
      'VELOCIDAD SÍNCRONA vs de plena carga: velocidad síncrona Ns = 120 × f / polos. En red de 60 Hz: ' +
      '2 polos = 3600 rpm, 4 polos = 1800 rpm, 6 polos = 1200 rpm. El motor de inducción a plena carga ' +
      'gira 2-5% por debajo de la síncrona (deslizamiento o slip). El deslizamiento AUMENTA con la carga: ' +
      'un motor más cargado gira más lento. Una variación de velocidad inesperada en una máquina ' +
      'accionada por correas o en el proceso puede indicar cambio de carga o de frecuencia de red.',
    topic: 'synchronous_speed_slip',
    source_reference:
      'ElectricalTechnology - velocidad síncrona y deslizamiento',
  },
  {
    chunk_text:
      'REGLA DEL AMPERAJE: como orientación rápida, un motor trifásico de 380V y 4 polos consume ' +
      'aproximadamente 2 A por kW de potencia nominal (p. ej. 15 kW ≈ 30 A; 7.5 kW ≈ 15 A). Con esta ' +
      'regla se puede cruzar la placa del motor (kW) contra la corriente medida (A) para detectar ' +
      'sobrecarga grosera sin herramientas. La placa del motor con la corriente nominal es SIEMPRE la ' +
      'referencia correcta; la regla de 2 A/kW es solo un chequeo rápido.',
    topic: 'amps_per_kw_rule',
    source_reference:
      'Práctica de campo - corriente por kW en motores trifásicos',
  },
  {
    chunk_text:
      'RELEVADOR TÉRMICO de sobrecarga: se ajusta a 1.0-1.25× la corriente nominal (típico 1.15×) y su ' +
      'clase de disparo (trip class) permite que la corriente de arranque (5-8× nominal por 1-5 s) NO ' +
      'lo dispare: clase 10 dispara en ≤10 s a 7.5× el ajuste, clase 20 en ≤20 s, clase 30 en ≤30 s. ' +
      'Para arranques largos o con inercia grande se usan clases 20/30. Esto explica por qué un motor ' +
      'tolera la corriente de arranque pero NO la sobrecarga sostenida: el relevador térmico modela ' +
      'la temperatura del motor, no solo la corriente instantánea.',
    topic: 'thermal_overload_relay',
    source_reference: 'Eaton - relevador térmico de sobrecarga (trip classes)',
  },
  {
    chunk_text:
      'PROTECCIÓN del motor (ajustes típicos de un relevador de protección de motor - MPR): sobrecarga ' +
      'térmica = 1.0-1.15× FLA; rotor bloqueado/stall = 1.5-2× FLA durante 5-10 s; desbalance de fase ' +
      '= 5-10%; falta de fase; falla a tierra = 10-30% de FLA; baja tensión = 80-90% de la nominal. ' +
      'El desbalance de tensión detectado por fase es una de las protecciones más valiosas porque ' +
      'previene el recalentamiento por tensión desequilibrada antes de que el térmico actúe. Estos ' +
      'valores son referencias de campo; cada instalación se ajusta a su placa y carga.',
    topic: 'motor_protection_settings',
    source_reference:
      'Eaton - ajustes típicos de relevadores de protección de motores',
  },
  {
    chunk_text:
      'TEMPERATURA de rodamientos: un rodamiento en operación normal en un ambiente industrial está ' +
      'típicamente 40-60°C por encima del ambiente en la caja (valores de 70-80°C son habituales en ' +
      'verano). 82°C (180°F) es el umbral de alarma de uso común; por encima de 90°C la grasa se ' +
      'degrada rápidamente (su vida se reduce a la mitad por cada 10°C), y >100°C hay riesgo de ' +
      'agarrotamiento. La temperatura del rodamiento se mide en la CAJA (housing), no en la superficie ' +
      'del motor. En nuestro sistema, una temperatura de superficie alta combinada con vibración ' +
      'creciente señala rodamiento en falla térmica.',
    topic: 'bearing_temperature_limits',
    source_reference:
      'MachineryLubrication - monitoreo de temperatura de rodamientos',
  },
  {
    chunk_text:
      'SOBRELUBRICACIÓN (overgreasing): lubricar de más hace que los elementos rodantes "batan" la ' +
      'grasa, lo que aumenta la TEMPERATURA y la VIBRACIÓN, y puede causar fugas por los sellos y ' +
      'eventualmente el agarrotamiento. Regla: llenar el rodamiento hasta 1/3 a 1/2 del espacio libre, ' +
      'y reengrasar según el intervalo del fabricante (no "cada semana por las dudas"). Tras reengrasar, ' +
      'un pequeño aumento de temperatura por unos minutos es normal; si persiste elevado, hay exceso. ' +
      'Los cambios bruscos de temperatura/vibración tras una tarea de lubricación apuntan a un problema ' +
      'de lubricación, no a la máquina.',
    topic: 'overgreasing',
    source_reference:
      'MachineryLubrication - señales de sobrelubricación de rodamientos',
  },
  {
    chunk_text:
      'MONTAJE del acelerómetro: la medición de vibración depende fuertemente del montaje. Lo óptimo ' +
      'es un montaje con perno (stud) sobre una superficie plana mecanizada. Un imán es aceptable solo ' +
      'por debajo de ~1 kHz (pierde fidelidad en frecuencias altas de rodamientos); un palpador ' +
      'manual (probe) varía según el operador y no es repetible. En el sistema, el acelerómetro del ' +
      'ESP32 debe ir firmemente fijado (perno o pegamento de montaje, nunca suelto) en la caja del ' +
      'rodamiento o en la carcasa del motor, en dirección radial y si es posible también axial. Un ' +
      'sensor flojo genera lecturas erráticas o atenuadas que pueden confundirse con fallas.',
    topic: 'accelerometer_mounting',
    source_reference:
      'KSI Instruments - montaje de acelerómetros piezoeléctricos',
  },
  {
    chunk_text:
      'PUNTOS de medición de vibración: medir en las cajas de los DOS rodamientos (extremo de accionamiento ' +
      'y extremo libre), en tres direcciones: horizontal, vertical y axial. Axial alto → desalineación; ' +
      'radial alto → desbalance o rodamiento. En el sistema con acelerómetro triaxial, comparar el eje ' +
      'axial contra los radiales: si el axial es el dominante, la causa típica es desalineación o ' +
      'problema de empuje; si el radial, desbalance o rodamiento. Esta distinción se puede mostrar como ' +
      'pista en el detalle del motor.',
    topic: 'vibration_measurement_points',
    source_reference: 'Vibromera.eu - puntos de medición de vibración (HVA)',
  },
  {
    chunk_text:
      'VIBRACIÓN que aparece solo CON el motor energizado y desaparece al cortar energía (o cambia ' +
      'mucho con la carga): problema ELÉCTRICO (excentricidad, barra de rotor rota, problema de ' +
      'bobinado) — la vibración mecánica por desbalance/rodamiento persiste durante la deceleración. ' +
      'La vibración de origen eléctrico aparece a 1× o 2× la FRECUENCIA DE RED (60/120 Hz con red de ' +
      '60 Hz), no a la frecuencia de giro. Si la vibración varía con la carga y no hay ruido mecánico, ' +
      'sospechar problema eléctrico y medir corrientes por fase y tensión.',
    topic: 'electrical_vibration_signature',
    source_reference: 'Vibromera.eu - firma de vibración eléctrica',
  },
  {
    chunk_text:
      'CORRIENTE DE ARRANQUE (inrush): al energizar, un motor DOL toma 6-8× la corriente nominal (a ' +
      'veces hasta 5×, depende del diseño) durante 1-5 segundos mientras acelera. Cada arranque es un ' +
      'evento de alta energía (I²t) que calienta el bobinado; los arranques frecuentes y repetidos ' +
      'calientan el motor más que la operación continua. En nuestro sistema, lecturas altas AISLADAS en ' +
      'el instante del arranque son normales y no deben considerarse anomalía; el filtrado debe ignorar ' +
      'el transitorio de arranque (el sistema descarta lecturas durante arranque o usa la corriente en ' +
      'régimen). La sobrecarga térmica se evalúa sobre la corriente sostenida.',
    topic: 'inrush_startup_transient',
    source_reference:
      'Eaton / ElectricalTechnology - corriente de arranque y arranques repetidos',
  },
  {
    chunk_text:
      'FACTOR DE SERVICIO (SF): indica cuánta sobrecarga puede soportar el motor en forma continua sin ' +
      'exceder los límites de temperatura del aislamiento. SF 1.15 permite operar hasta 115% de la ' +
      'potencia nominal de forma continua, pero con margen de vida reducido. En el sistema, operar por ' +
      'encima de la corriente nominal pero dentro del SF es legal pero desgasta más; la zona de ' +
      'advertencia (1.05-1.3× nominal) cubre ese rango. Sobre SF 1.15 se acorta la vida del motor por ' +
      'el exceso térmico (regla del 10°C).',
    topic: 'service_factor_detail',
    source_reference: 'Grainger / NEMA MG-1 - factor de servicio',
  },
  {
    chunk_text:
      'EFICIENCIA y pérdidas del motor: la eficiencia de motores de inducción estándar va de ~70% en ' +
      'los más chicos (<1 HP, algunos ~50%) a ~96% en los grandes (>500 HP). Las pérdidas se convierten ' +
      'en CALOR: cobre en bobinado (I²R), hierro (núcleo), mecánicas (fricción/ventilación). Por eso ' +
      'un motor mal ventilado o sobrecargado se calienta: la energía no se transforma en trabajo, se ' +
      'disipa en calor. Operar un motor a carga muy baja reduce su eficiencia (factor de potencia y ' +
      'rendimiento caen), aunque no lo daña; sobredimensionar motores es ineficiente pero no peligroso.',
    topic: 'motor_efficiency_heat',
    source_reference: 'DOE Energy.gov - eficiencia de motores de inducción',
  },
  {
    chunk_text:
      'TENDENCIA como criterio predictivo (ISO 13373): un cambio del 25% en la vibración respecto a la ' +
      'línea base justifica investigación, aunque el valor absoluto siga dentro de zona aceptable. ' +
      'Práctica recomendada: alarma en ~125% de la línea base y peligro en ~200%. En el sistema, además ' +
      'de los umbrales fijos (zona A-D), conviene mirar la pendiente: vibración o temperatura que ' +
      'crecen de forma constante aunque lentamente indican degradación incipiente (rodamiento, ' +
      'desbalance creciente) y permiten programar la parada antes de la falla. La tendencia importa ' +
      'tanto como el valor absoluto.',
    topic: 'trending_25_baseline',
    source_reference: 'ISO 13373-1 - monitoreo de condición por tendencias',
  },
  {
    chunk_text:
      'SEÑALES TEMPRANAS en rodamientos: el OÍDO detecta la falla tarde; la VIBRACIÓN la detecta meses ' +
      'antes. El aumento de ruido audible (golpeteo, rechinido) es un indicador TARDÍO. Los primeros ' +
      'signos del rodamiento en falla son: vibración de alta frecuencia creciente (BPFO/BPFI) y ' +
      'temperatura levemente elevada en la caja; la CORRIENTE solo sube cuando la fricción ya es ' +
      'importante (indicador rezagado). En una bomba, la primera señal perceptible de falla de ' +
      'rodamiento es la vibración; temperatura y corriente llegan mucho después. Por eso la vibración ' +
      'es el sensor más valioso del sistema para mantenimiento predictivo.',
    topic: 'early_bearing_signals',
    source_reference:
      'SKF / Pumps.org - indicadores tempranos de falla de rodamiento',
  },
  {
    chunk_text:
      'ZUMBIDO del motor: todos los motores de CA zumban a 2× la frecuencia de red (120 Hz en red de ' +
      '60 Hz) por magnetostricción; es normal. Un cambio en el carácter del zumbido (más fuerte, más ' +
      'agudo, rítmico) sí es relevante: zumbido fuerte con corriente desbalanceada = problema ' +
      'eléctrico (fase abierta, espiras cortas, tensión desbalanceada); zumbido fuerte sin desbalance ' +
      '= posible problema mecánico o de montaje. El cambio de tono respecto a la operación normal es ' +
      'un indicador tan válido como el valor numérico.',
    topic: 'motor_hum_normal',
    source_reference: 'ElectricNeutron - ruido y magnetostricción en motores',
  },
  {
    chunk_text:
      'Medición de TENSIÓN entre fases: medir U12, U23 y U31 con el motor en carga estable. El ' +
      'desbalance de tensión se calcula como (desviación máxima respecto al promedio / promedio) × 100. ' +
      'Un desbalance de 1% produce ~6-10% de desbalance de corriente; 5% de tensión puede producir ' +
      'hasta 40% de desbalance de corriente. La corriente desbalanceada calienta el bobinado ' +
      'desigualmente. NEMA recomienda de-rata desde 1% y NO operar sobre 5%. Verificar también caídas ' +
      'de tensión por contactos flojos o conductores subdimensionados en el tablero.',
    topic: 'voltage_measurement_unbalance',
    source_reference:
      'Fluke / NEMA MG-1 - desbalance de tensión en motores trifásicos',
  },
  {
    chunk_text:
      'BAJA TENSIÓN (undervoltage): una caída de tensión del 10% hace que el motor tome ~10-15% más de ' +
      'corriente y el par caiga ~19% (el par es proporcional al cuadrado de la tensión). Síntoma en el ' +
      'sistema: corriente alta con vibración normal y proceso "lento" o sin fuerza. Antes de acusar al ' +
      'motor de sobrecarga, medir tensión en el tablero con el motor en carga: si está baja, el ' +
      'problema es la alimentación. Un motor trifásico subalimentado no trabaja "menos": toma más ' +
      'amperes y se calienta.',
    topic: 'undervoltage_current_effect',
    source_reference:
      'ElectricalTechnology / Fluke - efecto de la baja tensión en motores',
  },
  {
    chunk_text:
      'FRECUENCIA de medición para mantenimiento predictivo (ruta de vibraciones): mensual para motores ' +
      'normales, SEMANAL para motores críticos, y siempre después de cada reparación o intervención ' +
      'importante para re-establecer la línea base. El registro de datos periódicos (diario/semanal) de ' +
      'vibración, temperatura y corriente es lo que permite detectar la degradación incipiente antes ' +
      'de la falla. En nuestro sistema, los datos se guardan continuamente; lo importante es REVISAR las ' +
      'tendencias y las alertas, no solo la pantalla del momento.',
    topic: 'pm_measurement_frequency',
    source_reference: 'IRIMerd / ISO 13373 - rutas de medición de vibración',
  },
  {
    chunk_text:
      'HERRAMIENTAS de diagnóstico eléctrico en el panel del operador: pinza amperométrica (corriente ' +
      'por fase, comparar las tres), multímetro (tensión entre fases y continuidad), megóhmetro ' +
      '(aislamiento del bobinado, motor desenergizado), y termografía (puntos calientes en borneras y ' +
      'conexiones). Un punto caliente LOCALIZADO en la bornera del motor indica conexión floja u ' +
      'oxidada (resistencia de contacto); una caja de rodamiento caliente indica rodamiento en falla. ' +
      'La termografía distingue fácilmente "conexión floja" (caliente puntual) de "motor sobrecargado" ' +
      '(caliente en toda la carcasa).',
    topic: 'diagnostic_tools_field',
    source_reference:
      'Fluke - termografía y herramientas de diagnóstico de motores',
  },
  {
    chunk_text:
      'TOLERANCIAS de alineación de acoplamiento flexible: alineación aproximada = angular ±0.10 mm/100mm ' +
      'y offset ±0.10-0.20 mm; alineación fina = angular ±0.05 mm/100mm y offset ±0.05-0.10 mm; ' +
      'alineación de precisión = angular ±0.02 mm/100mm y offset ±0.05 mm. La desalineación fuera de ' +
      'tolerancia genera vibración a 2× y axial, desgaste de rodamientos y de sellos, y es la causa ' +
      'principal de fallas en trenes motor-bomba (~28% de las fallas). Verificar alineación con ' +
      'comparador de carátula o láser y re-torquear los pernos de la base.',
    topic: 'alignment_tolerances',
    source_reference:
      'Opintek / ISO 10816 - tolerancias de alineación de acoplamientos',
  },
  {
    chunk_text:
      'CHECKLIST antes del primer arranque o tras un largo paro: 1) Verificar sentido de giro (con el ' +
      'acoplamiento DESCONECTADO o con prueba de pulso; un sentido invertido puede dañar una bomba o ' +
      'ventilador inmediatamente). 2) Medir tensión entre fases y su balance. 3) Medir resistencia de ' +
      'aislamiento (megger) si estuvo mucho tiempo parado. 4) Medir la resistencia de bobinados fase a ' +
      'fase (deben estar balanceadas dentro de 1-2%). 5) Confirmar que el eje gira libre a mano. ' +
      '6) Verificar rodamientos, correas, acoplamiento y fijaciones. 7) Revisar el ajuste del relevador ' +
      'térmico y el sentido de rotación del ventilador de enfriamiento.',
    topic: 'prestart_checklist',
    source_reference: 'Megger / Fluke / NEMA - verificación previa al arranque',
  },
  {
    chunk_text:
      'Verificación tras reparación o rebobinado de un motor: 1) Megger de aislamiento contra tierra. ' +
      '2) Medición de resistencia de bobinados fase a fase (balanceadas dentro de 1-2%; una diferencia ' +
      '>5% indica espiras cortas o bobinado defectuoso). 3) Prueba en vacío: corriente en vacío ~30% de ' +
      'la nominal, sin vibración ni ruido anormal. 4) Verificación de sentido de giro. 5) Monitoreo ' +
      'cercano de temperatura y vibración las primeras horas de operación (el sistema puede usarse ' +
      'para seguir la puesta en marcha). Una corriente en vacío excesivamente alta (>50% nominal) tras ' +
      'rebobinado sugiere bobinado defectuoso.',
    topic: 'post_repair_verification',
    source_reference: 'Megger / Fluke - verificación de motores reparados',
  },
  {
    chunk_text:
      'TEMPERATURA de superficie vs bobinado: la temperatura medida en la superficie de un motor TEFC ' +
      'es típicamente 20-40°C inferior a la temperatura del bobinado (puede ser hasta 30°C menor). ' +
      'La clase de aislamiento se refiere al punto caliente del bobinado, no a la superficie. Por eso ' +
      'nuestros umbrales de superficie (≤70°C sano, 70-90°C advertencia, >90°C crítico para clase B) ' +
      'son más bajos que la clase del aislamiento (130°C): el margen compensa la diferencia superficie-' +
      'bobinado. Un termómetro infrarrojo mide la superficie, que puede estar 30°C por debajo del ' +
      'bobinado: no usar lecturas IR como temperatura de bobinado.',
    topic: 'surface_vs_winding_temp',
    source_reference:
      'Fluke / MotionControlTips - temperatura de superficie vs bobinado',
  },
  {
    chunk_text:
      'TEMPERATURA como indicador REZAGADO: la corriente sube antes que la temperatura; la temperatura ' +
      'es una consecuencia térmica (constante de tiempo térmica del motor: ~15 minutos en motores ' +
      'pequeños, horas en grandes). Un motor puede tomar corriente excesiva durante un tiempo sin que ' +
      'la temperatura llegue a su máximo. Cuando la temperatura de superficie alcanza la zona crítica, ' +
      'el daño térmico ya está en curso. Por eso la CORRIENTE es el sensor de respuesta rápida y la ' +
      'TEMPERATURA el de confirmación de daño térmico: ambos son complementarios en el sistema.',
    topic: 'temperature_lagging_indicator',
    source_reference: 'Fluke - temperatura como indicador rezagado de motores',
  },
  {
    chunk_text:
      'EL OPERADOR es la primera línea de defensa: oído, vista, tacto y olfato detectan fallas ' +
      'incipientes antes que cualquier sensor. Un cambio de ruido (zumbido nuevo, golpeteo, rechinido), ' +
      'olor a barniz quemado (bobinado sobrecalentado), vibración visible en la base, o temperatura ' +
      'anormal al tacto (con cuidado) son señales válidas que el sistema no siempre captura. Si el ' +
      'panel muestra valores normales pero el motor "se siente mal", programar una inspección. El ' +
      'registro del operador (logbook) es el complemento humano del monitoreo automático y aporta ' +
      'contexto que los números no tienen.',
    topic: 'operator_first_line',
    source_reference:
      'ReliablePlant - el operador como primera línea de defensa',
  },
  {
    chunk_text:
      'OLOR A QUEMADO: el olor a barniz/laca caliente del bobinado es una señal TARDÍA de daño térmico: ' +
      'cuando el bobinado huele, el aislamiento ya se está degradando. Ante olor a quemado: detener el ' +
      'motor, verificar corriente y aislamiento (megger), y NO re-arrancar hasta revisar. Un motor que ' +
      'huele a quemado y se re-arranca puede fallar en segundos por cortocircuito del bobinado. El ' +
      'olor a goma o plástico quemado en la zona de la bornera sugiere conexiones sobrecalentadas.',
    topic: 'burning_smell',
    source_reference: 'Fluke - modos de falla del bobinado',
  },
  {
    chunk_text:
      'DIAGNÓSTICO rápido en el panel: si la corriente es alta (>1.05× nominal) y la temperatura sube ' +
      '→ sobrecarga térmica/eléctrica, medir tensión y verificar carga. Si la vibración es alta y la ' +
      'corriente normal → problema mecánico (desbalance, desalineación, rodamiento), no eléctrico. Si ' +
      'temperatura alta con corriente normal → ventilación obstruida o ambiente caliente (aletas ' +
      'sucias, ventilador de enfriamiento roto). Si los tres sensores fallan juntos → problema de ' +
      'comunicación/ESP32, no tres fallas físicas. Este orden lógico resuelve la mayoría de las ' +
      'consultas en campo sin herramientas adicionales.',
    topic: 'quick_diagnosis_panel',
    source_reference: 'Lógica de diagnóstico del sistema + prácticas de campo',
  },
  {
    chunk_text:
      'MANEJO de falsas alarmas: un sensor en falla (stuck, out_of_range o disconnected) puede haber ' +
      'generado la alerta original. Al revisar un motor "deshabilitado" o con "alarma", verificar el ' +
      'estado de los sensores en el panel ANTES de mover la máquina: si el sensor que disparó la alerta ' +
      'está en falla, la lectura pudo ser espuria. El procedimiento correcto es: 1) revisar estado de ' +
      'sensores, 2) revisar historial de alertas, 3) inspección física, 4) corregir causa, 5) recién ' +
      'entonces reactivar. Reactivar sin revisar puede reproducir el problema o enmascarar una falla real.',
    topic: 'false_alarm_handling',
    source_reference: 'Procedimientos operativos del sistema',
  },
  {
    chunk_text:
      'MÉTODOS DE ARRANQUE y su corriente: DOL (arranque directo) toma 5-8× la nominal; estrella-' +
      'triángulo reduce la corriente de arranque a ~1/3 pero también el par a ~1/3 (solo para ' +
      'arranques en vacío o carga ligera); autotransformador ~50-80%; arrancador suave (soft-start) ' +
      '2-4× ajustable; variador (VFD) 1-1.5× con rampa controlada. Cuanto más "suave" el arranque, ' +
      'menor la corriente de pico y el estrés térmico y mecánico. Si un motor con DOL arranca ' +
      'repetidamente en nuestro sistema, los picos de corriente son normales pero desgastan el motor.',
    topic: 'starting_methods_current',
    source_reference: 'ElectricalEasy / NEMA - métodos de arranque de motores',
  },
  {
    chunk_text:
      'TORQUE del motor y sobrecarga: el motor de inducción tiene par de arranque (locked rotor) y par ' +
      'máximo (breakdown) típicamente 2-2.5× el par nominal. Si la carga exige más par que el breakdown, ' +
      'el motor se detiene (stall). Operando por debajo de la carga nominal, la corriente es ' +
      'aproximadamente proporcional al par de carga: 50% de carga → ~50% de corriente. Un motor que ' +
      'nunca alcanza su velocidad nominal bajo carga indica que la carga supera su capacidad: verificar ' +
      'selección del motor, no solo el motor.',
    topic: 'torque_speed_curve',
    source_reference:
      'ElectricalEasy - curva torque-velocidad del motor de inducción',
  },
  {
    chunk_text:
      'RESONANCIA y holgura: vibración alta con picos en MÚLTIPLES armónicos (1×, 2×, 3×...) y ruido de ' +
      'banda ancha elevado indica holgura mecánica (base floja, pernos sueltos, rodamiento holgado en su ' +
      'caja) o resonancia estructural. La holgura cambia bruscamente con la carga. Verificar: apriete de ' +
      'pernos de fijación, nivelación y grouting de la base, asiento de rodamientos, y si la frecuencia ' +
      'natural de la estructura coincide con la velocidad de giro (resonancia) — en ese caso variar la ' +
      'velocidad de operación o rigidizar la base.',
    topic: 'resonance_looseness',
    source_reference: 'Vibromera.eu - holgura mecánica y resonancia',
  },
  {
    chunk_text:
      'ISO 10816-3 define las zonas de severidad de vibración para maquinaria en el rango 600-12000 rpm ' +
      'medida como velocidad RMS en mm/s: Zona A: máquinas nuevas o recién reparadas en condición óptima. ' +
      'Zona B: aceptable para operación prolongada sin restricciones. Zona C: operación limitada y se debe ' +
      'planear la corrección en cuanto sea posible. Zona D: nivel de daño, detener la máquina. La decisión ' +
      'de alarma se basa en las fronteras B/C y C/D, no en valores absolutos de los sensores.',
    topic: 'iso10816_zones',
    source_reference: 'ISO 10816-3 - zonas de severidad de vibración',
  },
  {
    chunk_text:
      'Límites de vibración ISO 10816-3 para motores Clase II (15-300 kW, máquinas medianas montadas sobre ' +
      'fundaciones): Zona A hasta 1.4 mm/s, Zona B hasta 2.8 mm/s, Zona C hasta 7.1 mm/s, Zona D por ' +
      'encima de 7.1 mm/s RMS. Para evaluar un motor de tamaño medio usar estos límites en lugar de los de ' +
      'Clase I. Un motor de este rango en la frontera C/D (7.1 mm/s) ya tiene daño en desarrollo.',
    topic: 'iso10816_class2',
    source_reference: 'ISO 10816-3 - Clase II (15-300 kW)',
  },
  {
    chunk_text:
      'Límites de vibración ISO 10816-3 para motores Clase III (300 kW a 50 MW, máquinas grandes sobre ' +
      'fundaciones rígidas): Zona A hasta 1.8 mm/s, Zona B hasta 3.5 mm/s, Zona C hasta 7.1 mm/s, Zona D ' +
      'por encima de 7.1 mm/s RMS. Para motores grandes las fundaciones amortiguan la vibración, por eso ' +
      'los límites de la zona A/B son más altos que en Clase I. Verificar siempre en qué clase está el ' +
      'motor antes de juzgar un valor.',
    topic: 'iso10816_class3',
    source_reference: 'ISO 10816-3 - Clase III (grandes máquinas)',
  },
  {
    chunk_text:
      'Para diagnóstico RAG de vibración: citar SIEMPRE la clase ISO 10816-3 correspondiente a la ' +
      'potencia del motor. Clase I (<15 kW): A≤0.71, B≤1.8, C≤4.5 mm/s. Clase II (15-300 kW): A≤1.4, ' +
      'B≤2.8, C≤7.1 mm/s. Clase III (>300 kW rígida): A≤1.8, B≤3.5, C≤7.1 mm/s. Si no se conoce la ' +
      'potencia, usar Clase II como referencia conservadora y aclararlo.',
    topic: 'iso10816_reference_table',
    source_reference: 'ISO 10816-3 - tabla de referencia de clases',
  },
  {
    chunk_text:
      'La medición de vibración de un motor debe tomarse en la carcasa del rodamiento (tapa), en tres ' +
      'direcciones: horizontal (H), vertical (V) y axial (A). La dirección que predomina indica la causa: ' +
      'vibración H o V alta sugiere desbalance o rodamiento; vibración AXIAL alta sugiere desalineación o ' +
      'problema de acoplamiento. Un solo sensor de vibración en el sistema capta la magnitud total; la ' +
      'dirección se complementa con el patrón de la causa.',
    topic: 'vibration_measurement_directions',
    source_reference: 'ISO 10816-1 - puntos y direcciones de medición',
  },
  {
    chunk_text:
      'Análisis de espectro de vibración: desbalance = pico dominante a 1× la velocidad de giro (1X), ' +
      'dirección radial, estable en magnitud. Desalineación = pico dominante a 2× la velocidad (2X) con ' +
      'armónico axial y a veces 1X. Holgura = picos a múltiplos enteros (1X, 2X, 3X...) y subarmónicos a ' +
      '0.5X. Problemas eléctricos = picos a 2× la frecuencia de red (120 Hz en 60 Hz) con bandas laterales. ' +
      'Estas firmas permiten distinguir la causa sin desarmar el motor.',
    topic: 'vibration_spectrum_signatures',
    source_reference: 'ISO 13373-1 - firmas de vibración en espectro',
  },
  {
    chunk_text:
      'Frecuencias de falla de rodamientos (espectro): BPFO (falla en pista exterior) ≈ 0.4×N·n, BPFI ' +
      '(pista interior) ≈ 0.6×N·n, BSF (elemento rodante) ≈ 0.23×N·n, FTF (jaula) ≈ 0.4×n, donde N es el ' +
      'número de bolillas y n la velocidad de giro. En la práctica: BPFO aparece cerca de 3.57× la ' +
      'velocidad de giro en Hz (3.57X) para un rodamiento típico de motor. La aparición temprana de BPFI ' +
      'con poca amplitud es señal de grieta inicial en la pista interior.',
    topic: 'bearing_fault_frequencies_formula',
    source_reference:
      'ISO 13373-2 - frecuencias características de rodamientos',
  },
  {
    chunk_text:
      'Frecuencia de paso de paleta (blade pass frequency, BPF) en ventiladores y bombas centrífugas: ' +
      'BPF = número de álabes × velocidad de giro. Picos a BPF y sus armónicos con baja magnitud son ' +
      'normales (interacción álabe-voluta); si crecen con el desgaste o aparecen con modulación indican ' +
      'cavitación, restricción de flujo o choque en la voluta. Si BPF está en la misma frecuencia que un ' +
      'pico de BPFO, la distinción requiere conocer el número de álabes de la máquina accionada.',
    topic: 'blade_pass_frequency_analysis',
    source_reference: 'ISO 13373-2 - frecuencia de paso de paleta',
  },
  {
    chunk_text:
      'Vibración eléctrica (2× frecuencia de red): picos a 120 Hz (en redes de 60 Hz) o 100 Hz (en 50 Hz) ' +
      'en el espectro de un motor indican problemas eléctricos: desbalance de fases, barras del rotor ' +
      'rotas, excentricidad estática o dinámica, o problemas de suministro. Si al cortar la energía la ' +
      'vibración desaparece, la causa es eléctrica y no mecánica. Es la prueba definitiva: medir con el ' +
      'motor energizado y confirmar que a 120 Hz desaparece al apagar.',
    topic: 'electrical_vibration_120hz',
    source_reference: 'ISO 13373-2 - vibración de origen eléctrico',
  },
  {
    chunk_text:
      'Tendencia de vibración: la vibración de un rodamiento sano es estable; un aumento progresivo y ' +
      'continuo (no estacional) indica desgaste acumulativo. Regla práctica: si la vibración se duplica ' +
      'respecto de su línea base en menos de 4 semanas, planificar detención para inspección de rodamientos. ' +
      'Una suba brusca (más de 3× en horas) indica evento agudo: daño de rodamiento, desbalance por ' +
      'depósito que se desprende, o problema eléctrico. La velocidad de cambio es tan diagnóstica como el ' +
      'valor absoluto.',
    topic: 'vibration_trending_rate',
    source_reference: 'ISO 13373-1 - análisis de tendencias de vibración',
  },
  {
    chunk_text:
      'La velocidad de vibración (mm/s RMS) es la variable correcta para evaluación de severidad según ISO ' +
      '10816-3. La aceleración (g) amplifica las altas frecuencias y sirve para detección temprana de ' +
      'rodamientos (fallas incipientes aparecen primero en alta frecuencia). El desplazamiento (µm) sirve ' +
      'para bajas frecuencias como desbalance en máquinas lentas. En el panel se muestra velocidad RMS; ' +
      'no confundir valores entre unidades.',
    topic: 'vibration_units_velocity_accel',
    source_reference: 'ISO 10816-1 - unidades de medición de vibración',
  },
  {
    chunk_text:
      'La aceleración de alta frecuencia (envolvente, spike energy o aceleración pico) es la técnica más ' +
      'sensible para detectar rodamientos incipientes: detecta la energía de impacto de la grieta antes ' +
      'de que la velocidad RMS suba. Un motor con velocidad RMS normal pero aceleración de alta frecuencia ' +
      'creciente está iniciando falla de rodamiento. Esta es la razón por la que "la vibración normal" no ' +
      'descarta un rodamiento en etapa temprana.',
    topic: 'bearing_early_hf_envelope',
    source_reference: 'ISO 13373-2 - envolvente de alta frecuencia',
  },
  {
    chunk_text:
      'Ruido audible del motor: silbido agudo con vibración normal → rodamiento en etapa temprana o fricción ' +
      'de sello; zumbido de 120/100 Hz con motor sano → problema eléctrico de estator o suministro; "golpeteo" ' +
      'rítmico → jaula del rodamiento (FTF) o carga variable; chirrido metálico al arrancar y parar → falta de ' +
      'lubricación. El ruido aporta diagnóstico solo combinado con vibración y corriente, nunca aislado.',
    topic: 'motor_noise_patterns',
    source_reference: 'SKF - diagnóstico acústico de rodamientos',
  },
  {
    chunk_text:
      'Vibración con carga vs sin carga: si la vibración aumenta con la carga, sospechar desbalance, ' +
      'problema de acoplamiento, rodamiento cargado o problema eléctrico (barras rotas que modulan con la ' +
      'carga). Si la vibración es igual con y sin carga, la causa es independiente de la carga: desalineación ' +
      'o base floja. Esta prueba sencilla de descarga separa causas mecánicas de eléctricas en minutos.',
    topic: 'vibration_load_dependence',
    source_reference: 'ISO 13373-1 - variación de vibración con la carga',
  },
  {
    chunk_text:
      'Temperatura de rodamiento de motor: una tapa de rodamiento recién operada sano suele estar entre ' +
      '40 y 70°C. Si supera 80-90°C con carga normal, sospechar: sobrelubricación, desalineación, precarga ' +
      'excesiva, carga axial o daño incipiente. La temperatura de rodamiento sube DESPUÉS de que el daño ' +
      'ya comenzó (es un indicador tardío); la vibración de alta frecuencia lo detecta antes.',
    topic: 'bearing_temperature_diagnosis',
    source_reference: 'SKF / NEMA MG-1 - temperatura de rodamientos',
  },
  {
    chunk_text:
      'Regla de lubricación de rodamientos: con grasa, la cantidad correcta es llenar 1/3 a 1/2 de la ' +
      'cavidad del rodamiento, no más. El intervalo de relubricación depende de la velocidad: a mayor ' +
      'velocidad menor intervalo. Sobreengrasar (llenar el 100%) produce aumento de temperatura de 10-15°C ' +
      'y puede expulsar el sello. Después de relubricar, la temperatura sube temporalmente y debe volver ' +
      'a su valor base en unas horas; si no vuelve, hay exceso de grasa.',
    topic: 'bearing_grease_quantity',
    source_reference: 'SKF - lubricación de rodamientos (regla 1/3-1/2)',
  },
  {
    chunk_text:
      'Modos de falla de rodamientos: fatiga por carga (peladura en pistas), desgaste por contaminación ' +
      '(abrasivos entran por sellos dañados), corrosión por humedad, indentaciones por montaje a presión, ' +
      'pasaje de corriente eléctrica (brinelling, frecuente en motores con VFD sin protección de eje), y ' +
      'fatiga térmica por lubricación inadecuada. La inspección visual del rodamiento retirado revela la ' +
      'causa raíz: aspereza brillante = paso de corriente; pista desgastada uniforme = contaminación.',
    topic: 'bearing_failure_root_causes',
    source_reference: 'SKF - modos de falla de rodamientos',
  },
  {
    chunk_text:
      'Montaje de rodamientos: nunca golpear el rodamiento para montarlo; usar prensa o extractor y ' +
      'calentar el rodamiento (hasta 90-100°C) para montaje sobre eje. La indentación por montaje produce ' +
      'falla prematura que se manifiesta con vibración a BPFO desde el inicio. Verificar el ajuste del ' +
      'asiento del rodamiento en la tapa (holgura excesiva causa "giro de pista" y desgaste de la tapa). ' +
      'Un motor recién reparado que vibra más de lo que vibraba antes suele tener error de montaje o de ' +
      'alineación.',
    topic: 'bearing_mounting_errors',
    source_reference: 'SKF - manual de montaje de rodamientos',
  },
  {
    chunk_text:
      'El paso de corriente por el rodamiento (shaft current) es frecuente en motores con VFD y sin cepillo ' +
      'de puesta a tierra del eje o aislamiento de rodamiento. Síntoma: rodamientos fallan en 3-6 meses con ' +
      'superficie de pistas "acanalada" (fluting). Prevención: cepillo de tierra en el eje, rodamiento ' +
      'aislado, filtros de modo común en el VFD. Si un motor con VFD repite fallas de rodamiento, investigar ' +
      'corriente de eje ANTES de culpar a la lubricación.',
    topic: 'shaft_current_bearing_failure',
    source_reference: 'NEMA MG-1 - corrientes de eje en motores VFD',
  },
  {
    chunk_text:
      'Intervalo de relubricación orientativo: motores pequeños (hasta 1500 rpm) cada 4000-6000 horas, ' +
      'motores grandes cada 2000-4000 horas, o según fabricante. La tendencia de temperatura del rodamiento ' +
      'modifica el intervalo: cada 10°C por encima de la base acelera el envejecimiento de la grasa a la ' +
      'mitad. Si el motor está en ambiente sucio, húmedo o caliente, acortar el intervalo. Un rodamiento ' +
      'mal lubricado falla en meses; uno bien lubricado dura la vida útil del motor.',
    topic: 'grease_reLube_intervals',
    source_reference: 'SKF - intervalos de relubricación',
  },
  {
    chunk_text:
      'Compatibilidad de grasas: mezclar grasas de bases distintas (litio con polialfolefina, o con ' +
      'complejo) puede endurecer o licuar la mezcla y destruir el rodamiento. Si se cambia de tipo de grasa, ' +
      'limpiar bien la cavidad o relubricar en forma frecuente para "desplazar" la anterior. Usar el tipo ' +
      'recomendado por el fabricante del motor y registrar cuál se usa por máquina.',
    topic: 'grease_compatibility',
    source_reference: 'SKF - compatibilidad de grasas',
  },
  {
    chunk_text:
      'Desalineación angular y paralela: la desalineación paralela desplaza los ejes y produce par ' +
      'vibratorio a 2× la velocidad; la angular produce flexión y vibración axial a 1X-2X. Tolerancias ' +
      'típicas de alineación por método de láser: ≤0.05 mm en paralela y ≤0.05 mm/100 mm en angular para ' +
      'máquinas a 1500-3000 rpm. La desalineación carga los rodamientos y acelera su desgaste; también ' +
      'aumenta el consumo de energía.',
    topic: 'alignment_types_tolerances',
    source_reference: 'ISO/TS 16949 / fabricantes de alineadores láser',
  },
  {
    chunk_text:
      'Acoplamiento elástico: el desgaste de los elementos elásticos (goma, elastómero) se manifiesta como ' +
      'juego y golpeteo en la marcha, con picos a 2× en el espectro y fase inestable. Revisar el estado del ' +
      'elastómero en cada mantenimiento: grietas, deformación o desgaste indican reemplazo. Un acoplamiento ' +
      'mal estado genera vibración que a veces se atribuye al motor; verificar el acoplamiento antes de ' +
      'culpar al rodamiento.',
    topic: 'coupling_elastomer_wear',
    source_reference: 'SKF / fabricantes de acoplamientos',
  },
  {
    chunk_text:
      'Diagnóstico de transmisión por correas: la vibración de la correa se manifiesta a la frecuencia de ' +
      'paso de la correa (velocidad lineal entre la longitud de la correa) y sus armónicos; si la correa ' +
      'patina, la vibración y el ruido son intermitentes y la corriente del motor baja al deslizar (pierde ' +
      'carga). Tensión de correa correcta: deflexión ~1/64 de la distancia entre poleas por cada pulgada ' +
      'de luz con presión moderada. Correas flojas producen vibración a 1X del motor y golpeteo.',
    topic: 'belt_drive_diagnostics',
    source_reference: 'Gates - diagnóstico de transmisión por correas',
  },
  {
    chunk_text:
      'Alineación de poleas: poleas desalineadas (paralela o angular) aceleran el desgaste de la correa y ' +
      'generan vibración y desgaste asimétrico de la correa. Verificación simple: regla recta sobre las ' +
      'caras de ambas poleas; el borde de la correa debe asentar parejo en ambas. La desalineación de ' +
      'poleas también carga los rodamientos del motor en sentido axial. Antes de balancear un ventilador, ' +
      'verificar la alineación de su transmisión.',
    topic: 'pulley_alignment',
    source_reference: 'Gates - alineación de poleas',
  },
  {
    chunk_text:
      'Correa floja vs tensa: una correa DEMASIADO tensa carga los rodamientos en sentido radial y ' +
      'produce calor y ruido en el rodamiento cercano a la polea; una correa FLOJA patina, se calienta, y ' +
      'el motor pierde par pero su corriente puede bajar. Regla: la flecha de la correa en el tramo más ' +
      'largo debe ser ~1/64 pulgada por pulgada de separación entre centros. Revisar la tensión con la ' +
      'máquina detenida y energizada.',
    topic: 'belt_tension_rules',
    source_reference: 'Gates - tensión de correas trapezoidales',
  },
  {
    chunk_text:
      'Diagnóstico de cajas reductoras: la vibración se evalúa en cada punto de apoyo (rodamientos de ' +
      'entrada, intermedio y salida). Engranajes: pico a la frecuencia de engrane (GEAR MESH = dientes × ' +
      'velocidad de ese eje) con bandas laterales indica desgaste o error de excentricidad; si la banda ' +
      'lateral es mayor que el pico de engrane, hay modulación por desgaste. El aumento de temperatura del ' +
      'aceite de la caja es señal de pérdida de eficiencia.',
    topic: 'gearbox_vibration_diagnosis',
    source_reference: 'ISO 13373 - diagnóstico de cajas reductoras',
  },
  {
    chunk_text:
      'Aceite de caja reductora: nivel bajo → ruido y desgaste; nivel alto → agitación, espuma y ' +
      'sobrecalentamiento; aceite con partículas metálicas → desgaste activo de engranajes o rodamientos. ' +
      'La temperatura del aceite no debe superar típicamente 80-90°C. Si la temperatura de la caja sube ' +
      '10-15°C respecto de su valor habitual con la misma carga, investigar nivel, viscosidad o daño. El ' +
      'análisis de aceite periódico detecta desgaste antes de la vibración visible.',
    topic: 'gearbox_oil_temperature',
    source_reference: 'Fabricantes de reductoras - operación y mantenimiento',
  },
  {
    chunk_text:
      'Cavitación en bombas: se produce cuando la presión en la succión cae por debajo de la presión de ' +
      'vapor del líquido; los vapor pockets colapsan sobre el impulsor y erodan el metal. Síntomas: ruido ' +
      'de "grava" o mármol chocando, vibración de banda ancha con picos a altas frecuencias (múltiplos de ' +
      'la frecuencia de álabes), y corriente inestable. La cavitación daña el impulsor en horas. Corrección: ' +
      'aumentar NPSH disponible (nivel de succión, diámetro de cañería, reducir fricción de la línea), no ' +
      'solo estrangular la descarga.',
    topic: 'pump_cavitation_ops',
    source_reference: 'Hydraulic Institute - cavitación en bombas',
  },
  {
    chunk_text:
      'Operación de bombas fuera de su punto de diseño: operar una bomba muy a la derecha de su curva (flujo ' +
      'excesivo) aumenta la corriente y puede causar cavitación y sobrecarga del motor; operar muy a la ' +
      'izquierda (flujo bajo, recirculación) calienta el líquido y puede causar golpeteo y desgaste del ' +
      'impulsor. El punto de mejor eficiencia (BEP) es donde la bomba vibra menos. Si la corriente del motor ' +
      'es baja y la bomba vibra, sospechar recirculación interna.',
    topic: 'pump_operating_off_bep',
    source_reference: 'Hydraulic Institute - operación fuera del BEP',
  },
  {
    chunk_text:
      'Desbalance de ventiladores: la causa más común de vibración en ventiladores es el desbalance del ' +
      'rotor por acumulación de suciedad, depósitos asimétricos o álabe dañado. El desbalance aparece a 1× ' +
      'la velocidad de giro. La limpieza de los álabes suele resolver el problema antes que cualquier otra ' +
      'intervención. En ventiladores de tiro inducido la suciedad se acumula más rápido; planificar ' +
      'limpieza periódica.',
    topic: 'fan_imbalance_cleaning',
    source_reference: 'AMCA - mantenimiento de ventiladores',
  },
  {
    chunk_text:
      'Bajas velocidades del VFD y enfriamiento: un motor refrigerado por ventilador de eje (TEFC) pierde ' +
      'capacidad de enfriamiento al operar por debajo de su velocidad nominal, porque el propio motor gira ' +
      'el ventilador. A 50% de velocidad, el enfriamiento cae ~50%, pero las pérdidas no caen igual. ' +
      'Regla NEMA: a baja velocidad se debe reducir el par y la corriente sostenida (derating). Si un motor ' +
      'con VFD opera mucho tiempo a velocidad baja y la temperatura del bobinado sube, el derating es ' +
      'insuficiente.',
    topic: 'vfd_low_speed_thermal_derating',
    source_reference: 'NEMA MG-1 - derating por baja velocidad',
  },
  {
    chunk_text:
      'Desbalance de tensión: la norma NEMA MG-1 permite hasta 1% de desbalance de tensión sin consecuencias; ' +
      'un 2% eleva la corriente de la fase más cargada ~8% y la temperatura del bobinado ~5-10°C; un 3.5% ' +
      'puede reducir la vida útil del motor a la mitad. Por eso la evaluación del sistema recomienda ' +
      'verificar la tensión entre fases cuando hay sobrecalentamiento sin causa mecánica. El desbalance de ' +
      'tensión produce calentamiento DESPROPORCIONADO de una fase.',
    topic: 'voltage_unbalance_effect',
    source_reference: 'NEMA MG-1 - desbalance de tensión',
  },
  {
    chunk_text:
      'Medición de desbalance de tensión: el porcentaje de desbalance de tensión (NEMA) se calcula como la ' +
      'máxima desviación de la tensión promedio, dividida la tensión promedio, por 100. Ejemplo: fases de ' +
      '220, 223 y 226 V, promedio 223 V, desviación máxima 3 V → desbalance = (3/223)×100 = 1.35%. ' +
      'Valores de 2-3% ya son preocupantes en motores que trabajan a plena carga. Medir en la bornera del ' +
      'motor con el equipo en marcha y carga normal.',
    topic: 'voltage_unbalance_calculation',
    source_reference: 'NEMA MG-1 - cálculo de desbalance de tensión',
  },
  {
    chunk_text:
      'Monofásico (single phasing): la pérdida de una fase de alimentación en un motor trifásico en marcha ' +
      'no detiene el motor (sigue girando), pero la corriente en las dos fases restantes aumenta ~1.73× ' +
      '(raíz de 3) y la temperatura del bobinado sube rápido. Sin protección, el motor se quema en minutos. ' +
      'Síntoma en panel: una fase con corriente ~0 y las otras dos elevadas, motor zumbando y vibrando con ' +
      'picos a 120 Hz. Acción: detener, revisar fusible, contactor y conexiones.',
    topic: 'single_phasing_effect',
    source_reference: 'NEMA / IEEE - falla por pérdida de fase',
  },
  {
    chunk_text:
      'Sobrevoltaje (overvoltage): la norma NEMA permite operar el motor dentro de ±10% de la tensión ' +
      'nominal. Un sobrevoltaje sostenido del 10% eleva la saturación del hierro, la corriente de ' +
      'magnetización y la temperatura del bobinado, reduciendo vida útil y aumentando la corriente sin ' +
      'carga. La compensación automática de la tensión de los transformadores puede dar sobrevoltaje en ' +
      'horas de baja demanda; si la corriente sin carga es alta, verificar la tensión de placa.',
    topic: 'overvoltage_effect',
    source_reference: 'NEMA MG-1 - límites de tensión',
  },
  {
    chunk_text:
      'Corriente sin carga (no-load) de un motor de inducción: es típicamente 30-50% de la nominal ' +
      '(los motores grandes relativamente menor, los pequeños mayor). Una corriente sin carga MUY alta ' +
      '(>60-70%) sugiere: tensión alta, entrehierro aumentado por desgaste de rodamientos (baja eficiencia), ' +
      'bobinado con espiras en corto, o defecto de fabricación. La prueba del "tapón de papel": si con el ' +
      'motor sin carga el papel es atraído fuertemente, el entrehierro o el flujo están anormales.',
    topic: 'noload_current_high_causes',
    source_reference: 'NEMA / diagnóstico de motores - corriente sin carga',
  },
  {
    chunk_text:
      'Corriente de arranque (inrush): la corriente de arranque de un motor de inducción es 5-8× la ' +
      'nominal y dura hasta alcanzar velocidad (típicamente <1-3 s). Los picos de corriente en el panel al ' +
      'arrancar son normales si el arranque es directo (DOL). Si la corriente de arranque tarda demasiado ' +
      'en bajar, verificar: baja tensión de red, carga atascada, método de arranque mal dimensionado o ' +
      'barras de rotor con defecto. Un motor que arranca con corriente normal pero sube de temperatura ' +
      'rápido puede tener barras rotas.',
    topic: 'inrush_duration_analysis',
    source_reference: 'NEMA MG-1 - corriente de arranque',
  },
  {
    chunk_text:
      'Diagnóstico de barras de rotor rotas: la corriente con la máquina en marcha fluctúa con el doble de ' +
      'la frecuencia de deslizamiento (2·s·f), y el espectro de corriente muestra bandas laterales alrededor ' +
      'de la frecuencia de red separadas por 2·s·f. Síntomas prácticos: par reducido bajo carga, temperatura ' +
      'anormal, "vibración" pulsante a baja frecuencia. La prueba definitiva en campo: comparar la corriente ' +
      'de arranque entre fases (desbalance) y observar oscilaciones del amperímetro en régimen.',
    topic: 'broken_rotor_bar_diagnosis',
    source_reference: 'IEEE 1415 - diagnóstico de rotor de jaula',
  },
  {
    chunk_text:
      'Relé de sobrecarga térmica: protege el motor contra sobrecorriente prolongada respetando la curva ' +
      'de calentamiento. Se ajusta a la corriente de plena carga (FLA) de la placa, nunca a la medida en ' +
      'campo si la máquina está sobrecargada (eso "enmascara" la protección). Clases de disparo: clase 10 ' +
      '(motores de arranque rápido, se dispara en 10 s a 6× FLA), clase 20 (estándar), clase 30 (arranques ' +
      'pesados). Si el relé se dispara con frecuencia, la causa es sobrecarga real o ajuste incorrecto, no ' +
      '"el relé sensible".',
    topic: 'thermal_overload_relay_settings',
    source_reference: 'NEMA / fabricantes de relés de sobrecarga',
  },
  {
    chunk_text:
      'Arranque estrella-triángulo: reduce la corriente de arranque a ~1/3 de la de DOL, pero también el ' +
      'par de arranque a ~1/3. Solo es válido si el motor arranca en vacío o con carga ligera y puede ' +
      'acelerar en estrella (típicamente hasta ~80% de velocidad) antes de conmutar a triángulo. Si la ' +
      'transición es brusca, la corriente y el par picos pueden superar al arranque directo. Síntomas de ' +
      'falla: contactor de triángulo quemado, motor que no alcanza velocidad en estrella, o disparo del ' +
      'relé en la transición.',
    topic: 'star_delta_starting',
    source_reference: 'NEMA - arranque estrella-triángulo',
  },
  {
    chunk_text:
      'Arrancador suave (soft-starter): limita la corriente de arranque a un valor ajustable (típicamente ' +
      '2-4× FLA) mediante rampa de tensión. Su principal limitación es térmica: no se deben hacer arranques ' +
      'frecuentes en corto tiempo (el tiristor se calienta). Si un motor con soft-starter arranca repetido ' +
      'y el arrancador "salta" por sobre-temperatura, la causa es el ciclo de arranques, no la carga. El ' +
      'bypass electromecánico (contactor) saca los tiristores de línea en régimen y evita su calentamiento.',
    topic: 'soft_starter_limitations',
    source_reference: 'NEMA - arrancadores suaves',
  },
  {
    chunk_text:
      'Factor de servicio: el factor de servicio (SF) de un motor indica la sobrecarga continua permitida. ' +
      'Un motor de SF 1.15 puede operar de forma continua al 115% de la carga nominal SIN reducir su vida ' +
      'útil esperada, siempre que la tensión sea la nominal y la ventilación normal. Operar por encima del ' +
      'SF o con SF=1.0 al 115% acorta la vida. Cuando el sistema muestra temperatura en alza con carga alta, ' +
      'verificar contra el SF: si carga > SF, la causa es sobredimensionamiento de la carga.',
    topic: 'service_factor_operation',
    source_reference: 'NEMA MG-1 - factor de servicio',
  },
  {
    chunk_text:
      'Motores con VFD y temperatura: los motores alimentados por VFD sufren pérdidas adicionales por ' +
      'armónicos en el bobinado y el hierro. NEMA MG-1 Part 31 recomienda motores diseñados para uso VFD ' +
      '(con aislamiento reforzado) cuando la tensión de línea supera ~460 V o el cableado es largo. Si un ' +
      'motor con VFD a velocidad nominal calienta más que con red directa, es normal hasta cierto punto; ' +
      'el derating por baja velocidad se suma. Medir la temperatura en régimen y comparar con la base.',
    topic: 'vfd_motor_heating',
    source_reference: 'NEMA MG-1 Part 31 - motores para VFD',
  },
  {
    chunk_text:
      'VFD: tensión de bus DC: el VFD rectifica la red a un bus de DC (típicamente 1.35× la tensión RMS de ' +
      'línea, ~540 V DC para 400 V AC). Un bus DC bajo (p. ej. <460 V) indica caída de tensión de red o ' +
      'rectificador débil y produce sub-carga o disparo por bajo voltaje; un bus DC alto (regenerativo) puede ' +
      'disparar por sobrevoltaje en frenado. Si el VFD "salta" por sobrevoltaje, sospechar frenado con carga ' +
      'de alta inercia sin resistor de frenado.',
    topic: 'vfd_dc_bus_voltage',
    source_reference: 'Fabricantes de VFD - operación del bus DC',
  },
  {
    chunk_text:
      'Medición de aislamiento con megóhmetro: el valor mínimo aceptable de resistencia de aislamiento a ' +
      '20°C es aproximadamente 1 MΩ por cada kV de tensión nominal (regla de la IEEE 43): para 380-400 V, ' +
      '≥1 MΩ; para 6.6 kV, ≥6.6 MΩ. Un valor menor indica humedad, suciedad o daño del aislamiento. Medir ' +
      'con el motor desconectado, DESPUÉS de la descarga de capacitancias (cortocircuitar a tierra unos ' +
      'minutos). La humedad reduce la resistencia dramáticamente; un valor bajo en ambiente húmedo no ' +
      'siempre es daño definitivo.',
    topic: 'megger_minimum_values',
    source_reference: 'IEEE 43 - resistencia de aislamiento',
  },
  {
    chunk_text:
      'Índice de polarización (PI) y relación dieléctrica (DAR): el PI se calcula dividiendo la ' +
      'resistencia de aislamiento a 10 minutos por la de 1 minuto; valores ≥2.0 indican aislamiento ' +
      'correcto, 1.0-2.0 cuestionable, <1.0 malo (humedad o contaminación iónica). El DAR es la relación a ' +
      '60s/30s. Estos índices se toman con el mismo megóhmetro y son más estables que el valor absoluto. ' +
      'Si el PI es bajo pero el valor absoluto mejora al secar, la causa fue humedad.',
    topic: 'polarization_index',
    source_reference: 'IEEE 43 - índice de polarización',
  },
  {
    chunk_text:
      'Humedad y aislamiento: el motor más expuesto a humedad es el que más falla eléctricamente. Síntomas: ' +
      'resistencia de aislamiento baja, corrosión en bornera, condensación interna en arranques en frío. ' +
      'Prevención: calefactores de espacio (space heaters) cuando el motor está detenido, rejillas de ' +
      'ventilación protegidas, y sellado de la caja de conexiones. Al arrancar un motor almacenado por ' +
      'mucho tiempo, medir aislamiento primero y secar con calefactor si es necesario.',
    topic: 'moisture_insulation_ops',
    source_reference: 'IEEE 43 / EPRI - efecto de la humedad',
  },
  {
    chunk_text:
      'ESP32 y sensores: cuando TODOS los sensores de un motor entran en falla al mismo tiempo, la causa ' +
      'más probable es de comunicación o del microcontrolador (ESP32): corte de red, reinicio del ESP32, o ' +
      'pérdida de alimentación. No son tres fallas físicas independientes. Los valores que se muestran son ' +
      'los últimos recibidos antes del corte (datos congelados). Verificar primero alimentación y conexión ' +
      'del ESP32, reinicio y eventos del broker, antes de sospechar de los sensores.',
    topic: 'esp32_all_sensors_comm',
    source_reference: 'Arquitectura del sistema de telemetría',
  },
  {
    chunk_text:
      'Datos congelados vs falla real: si el valor de un sensor se mantiene EXACTAMENTE idéntico lectura ' +
      'tras lectura mientras los demás cambian, sospechar sensor atascado (stuck) o comunicación ' +
      'interrumpida del sensor individual. Si TODOS los valores quedan congelados, el problema es del ESP32 ' +
      'o de la red. Un valor congelado NO es una lectura real: no diagnosticar sobre él. Comparar el ' +
      'timestamp de la última lectura con la hora actual: lecturas viejas = comunicación caída.',
    topic: 'frozen_data_vs_real_fault',
    source_reference: 'Práctica del sistema + guía de sensores',
  },
  {
    chunk_text:
      'WiFi/LAN del ESP32: un ESP32 conectado por WiFi puede perder paquetes o reconectarse con latencia ' +
      'variable; por LAN (cable) la conexión es estable. Si el panel muestra lecturas que se "pierden" o ' +
      'con saltos de tiempo, verificar la señal WiFi del ESP32, canales congestionados y distancia al AP. ' +
      'Un reinicio del ESP32 genera un hueco de datos que en el panel se ve como sensores en falla ' +
      'temporal; distinguirlo de una falla real revisando el evento de reconexión.',
    topic: 'esp32_network_stability',
    source_reference: 'Guía de hardware del sistema (ESP32)',
  },
  {
    chunk_text:
      'Timestamps y tiempos: los datos de telemetría llegan con el timestamp del ESP32 en el momento de la ' +
      'lectura. Si el ESP32 no tiene reloj sincronizado (NTP), las horas pueden desplazarse y confundir el ' +
      'historial. En diagnóstico, priorizar la hora del último evento en el panel y la hora actual del ' +
      'sistema sobre valores aislados. Un "último dato: hace X min" que crece sin nuevas lecturas es el ' +
      'primer síntoma de que la comunicación con ese ESP32 está caída.',
    topic: 'timestamp_reliability',
    source_reference: 'Operación del sistema de telemetría',
  },
  {
    chunk_text:
      'Termografía de motores: los puntos calientes típicos son la bornera (conexiones flojas generan ' +
      'resistencia y calor localizado), el bobinado (difícil de ver por la carcasa), y los rodamientos. Una ' +
      'bornera con diferencia >10°C entre fases indica conexión floja o corroída. La termografía detecta ' +
      'sobrecalentamiento localizado que los sensores del sistema (montados en la superficie del motor) no ' +
      'captan por estar lejos de la zona. Combinar termografía con corriente para confirmar.',
    topic: 'thermography_motor_ops',
    source_reference: 'Fluke / EPRI - termografía de motores',
  },
  {
    chunk_text:
      'Análisis de vibraciones con análisis de aceite: en motores eléctricos el aceite solo aplica a ' +
      'rodamientos grandes lubricados con aceite o cajas reductoras; la tendencia de partículas metálicas ' +
      'y la viscosidad son los parámetros clave. Aumento de cobre o hierro indica desgaste activo. El ' +
      'análisis de aceite complementa la vibración: detecta desgaste químico o de contacto que la ' +
      'vibración no ve en etapas iniciales. Programar muestras cada 6 meses en cajas críticas.',
    topic: 'oil_analysis_motors',
    source_reference: 'ISO 18436 / laboratorios de análisis de aceite',
  },
  {
    chunk_text:
      'Rutina de inspección visual de un motor (checklist rápido): 1) fijación y pernos de base, 2) estado ' +
      'del cableado y bornera (decaimiento, quemaduras), 3) ventilador de enfriamiento y rejillas, 4) ' +
      'acumulación de polvo o aceite sobre la carcasa (actúa como aislante térmico), 5) fugas de aceite o ' +
      'grasa por sellos, 6) ruidos y vibración anormales, 7) temperatura de carcasa y rodamientos al tacto, ' +
      '8) corriente de las tres fases y tensión. Esta rutina de 5 minutos complementa los datos del panel ' +
      'y suele revelar la causa de una alerta antes de desarmar.',
    topic: 'visual_inspection_routine',
    source_reference: 'NEMA / prácticas de mantenimiento preventivo',
  },
  {
    chunk_text:
      'Ciclo de trabajo del motor (duty cycle): un motor de servicio continuo (S1) no debe intercalar ' +
      'paradas y arranques constantes; cada arranque con DOL equivale térmicamente a varios minutos de ' +
      'plena carga y acelera el envejecimiento del bobinado y el desgaste de rodamientos. Regla práctica: ' +
      'limitar a ~6 arranques por hora en motores medianos, menos en los grandes. Si el panel muestra ' +
      'temperatura alta en un motor que arranca y para seguido, el ciclo de trabajo es parte del problema.',
    topic: 'duty_cycle_operation',
    source_reference: 'IEC 60034-1 / NEMA - ciclos de trabajo',
  },
  {
    chunk_text:
      'Mantenimiento predictivo con tendencias: el valor de las tendencias está en la PENDIENTE, no en el ' +
      'valor puntual. Un motor a 3.2 mm/s que viene subiendo 0.2 mm/s por semana es más urgente que uno ' +
      'estable a 4.2 mm/s. La regla del 25% (aumento del 25% sobre la línea base entre mediciones ' +
      'periódicas) dispara alarma en mantenimiento predictivo. En el sistema, la línea base se establece ' +
      'con la primera semana de operación normal; comparar siempre contra esa base, no contra valores ' +
      'teóricos.',
    topic: 'predictive_trending_rule_25',
    source_reference: 'ISO 18436 - mantenimiento predictivo por tendencias',
  },
  {
    chunk_text:
      'Cálculo de carga del motor por corriente (regla de amperios): la corriente de plena carga (FLA) ' +
      'está en la placa. La carga aproximada se estima como (corriente medida / FLA) × 100, con el motor a ' +
      'plena tensión. Pero la corriente sin carga puede ser 30-50% de FLA, así que la regla pierde ' +
      'precisión en cargas bajas. Si la corriente medida supera el FLA de placa por encima del factor de ' +
      'servicio, el motor está sobrecargado: verificar carga mecánica, tensión y alineación antes de ' +
      'aumentar la protección.',
    topic: 'motor_load_current_estimate',
    source_reference: 'NEMA MG-1 - estimación de carga por corriente',
  },
  {
    chunk_text:
      'SEGURIDAD en intervenciones: antes de cualquier tarea sobre un motor (limpieza, medición, cambio de ' +
      'sensor), aplicar LOTO (Lockout-Tagout): bloquear el interruptor o llave, colocar candado y tarjeta, ' +
      'verificar ausencia de tensión con instrumento calibrado, y descargar capacitancias. No trabajar con ' +
      'anillos, pulseras ni cadenas cerca de borneras energizadas. Las mediciones con pinza amperimétrica ' +
      'deben hacerse con el equipo protegido y respetando la categoría de medición (CAT III/IV).',
    topic: 'loto_electrical_safety',
    source_reference: 'NFPA 70E / OSHA - LOTO en motores',
  },
  {
    chunk_text:
      'Medición segura de corriente con pinza amperimétrica: abrazar UNA sola fase a la vez (abrazar dos o ' +
      'tres fases suma vectorialmente y da cero), usar la categoría correcta (CAT III para tableros), ' +
      'verificar que la pinza esté cerrada sin espacio y que el conductor esté centrado. La medición con ' +
      'pinza flexible (Rogowski) para conductores gruesos. Nunca medir corriente con un multímetro común en ' +
      'serie sin la categoría y el rango adecuados.',
    topic: 'clamp_meter_safe_usage',
    source_reference: 'NFPA 70E - mediciones eléctricas seguras',
  },
  {
    chunk_text:
      'Reinicio y re-arranque seguro: tras una detención por alarma, verificar la causa ANTES de re-arrancar. ' +
      'Si el motor estuvo en sobrecarga y se re-arranca sin resolverla, el daño continúa. Después de una ' +
      'detención por protección térmica, esperar el enfriamiento del relé (clase del relé) o del motor ' +
      'antes de re-intentar; un re-arranque inmediato puede dañar el bobinado caliente. En el sistema, el ' +
      'protocolo de reinicio de un motor en estado alarm/disabled exige revisar sensores y causa previa.',
    topic: 'safe_restart_procedure',
    source_reference: 'NEMA / prácticas de seguridad de arranque',
  },
  {
    chunk_text:
      'Árbol de decisión de diagnóstico integrado (1ª línea): si la corriente es alta (>1.05× nominal) → ' +
      'sobrecarga eléctrica/mecánica: medir tensión, verificar desbalance de fases, revisar carga y ' +
      'acoplamiento. Si la vibración es alta con corriente normal → problema mecánico: desbalance, ' +
      'desalineación, rodamiento. Si la temperatura es alta con corriente normal → ventilación, ambiente ' +
      'caliente o derating de VFD. Si la temperatura y la corriente suben juntas → sobrecarga sostenida. ' +
      'Si todos los sensores fallan → comunicación/ESP32. Este árbol cubre ~90% de los casos del panel.',
    topic: 'diagnosis_tree_first_line',
    source_reference: 'Lógica de diagnóstico del sistema de telemetría',
  },
  {
    chunk_text:
      'Priorización de urgencia con datos del panel: URGENTE (actuar ahora): zona C/D de vibración, ' +
      'temperatura crítica, corriente > SF, olor a quemado, humo. PROGRAMADO (dentro de días): zona C ' +
      'estable, temperatura en alarma sin tendencia, corriente levemente alta. OBSERVACIÓN (planificar en ' +
      'mantenimiento): zona B en tendencia ascendente, sensores intermitentes. No todas las alertas del ' +
      'panel son "parar ya": la gravedad se juzga por la combinación de valor, tendencia y estado de los ' +
      'sensores involucrados.',
    topic: 'urgency_priority_matrix',
    source_reference: 'Práctica operativa del sistema de telemetría',
  },
  {
    chunk_text:
      'Cómo interpretar tres sensores en "warning" a la vez: verificar si comparten causa. Temperatura + ' +
      'corriente + vibración en alza juntos → sobrecarga mecánica real (carga atascada, fricción). ' +
      'Temperatura + corriente en alza con vibración normal → sobrecarga eléctrica o térmica. Vibración ' +
      'alta con corriente y temperatura normales → problema mecánico localizado. Un patrón coherente de ' +
      'sensores es más confiable que un valor aislado; un patrón INCOHERENTE (un sensor disparado y el ' +
      'resto normal) sugiere falla del sensor.',
    topic: 'multi_sensor_pattern',
    source_reference: 'Lógica de correlaciones del sistema',
  },
  {
    chunk_text:
      'Historial y contexto: antes de concluir, mirar el historial de 4 horas del sistema: hace cuánto ' +
      'que el valor sube, si hubo un evento de reinicio del motor (cooldown), si el motor fue recién ' +
      'reparado o re-arrancado, y si hubo trabajos eléctricos previos. Un motor recién intervenido con ' +
      'vibración alta probablemente tiene error de montaje o alineación; un motor con historial de alertas ' +
      'repetidas del mismo sensor probablemente tiene sensor defectuoso. El historial convierte una ' +
      'lectura puntual en diagnóstico.',
    topic: 'history_context_diagnosis',
    source_reference: 'Uso del historial del sistema de telemetría',
  },
  {
    chunk_text:
      'Análisis de aceite en cajas reductoras: los parámetros clave son la viscosidad, el número de ' +
      'partículas metálicas (cobre, hierro, estaño) y la presencia de agua. Aumento de hierro indica ' +
      'desgaste de engranajes; cobre indica bronce o bujes; agua por encima de 0.2% degrada la película ' +
      'lubricante. El análisis de aceite periódico detecta desgaste químico o de contacto que la vibración ' +
      'no ve en etapas iniciales. Programar muestras cada 6 meses en cajas críticas.',
    topic: 'oil_analysis_gearbox',
    source_reference: 'ISO 18436 / laboratorios de análisis de aceite',
  },
  {
    chunk_text:
      'LOTO (Lockout-Tagout) para motores: antes de cualquier tarea (limpieza, medición, cambio de sensor), ' +
      'bloquear la alimentación con candado y tarjeta propia, verificar ausencia de tensión con instrumento ' +
      'calibrado y descargar capacitancias. Nunca trabajar en un motor energizado sin PPE de arco. Los ' +
      'motores con VFD retienen tensión en el bus DC incluso con el interruptor abierto: esperar el tiempo ' +
      'de descarga indicado (o descargar activamente) antes de tocar.',
    topic: 'loto_vfd_discharge',
    source_reference: 'NFPA 70E / OSHA - LOTO en motores y VFD',
  },
  {
    chunk_text:
      'Eventos de reinicio y cooldown: cuando un motor se reinicia (restart), el sistema aplica un cooldown ' +
      'de seguridad durante el cual las alarmas de temperatura están atenuadas o con umbrales más altos, ' +
      'porque el arranque produce picos térmicos y de corriente normales. Si un motor recién reiniciado ' +
      'muestra valores en alza, comparar contra el tiempo transcurrido desde el reinicio y no alarmarse por ' +
      'los picos de los primeros minutos salvo que superen los umbrales de cooldown. No diagnosticar sobre ' +
      'datos tomados durante el arranque.',
    topic: 'restart_cooldown_event',
    source_reference: 'Lógica de estados y cooldown del sistema',
  },
  {
    chunk_text:
      'Estados de sensor del sistema: normal, warning, fault, fault_persistent, stuck, out_of_range, ' +
      'disconnected. fault: lectura fuera de rango o falla puntual; fault_persistent: falla que persiste ' +
      'varios ciclos; stuck: el valor no cambia entre lecturas (sensor atascado o sin comunicación); ' +
      'out_of_range: valor fuera del rango físico del sensor; disconnected: sin comunicación con el sensor. ' +
      'Un sensor en fault/stuck NO aporta datos confiables: sus valores se muestran como referencia pero no ' +
      'deben usarse para correlaciones ni conclusiones.',
    topic: 'sensor_states_full_reference',
    source_reference: 'Definición de estados del sistema de telemetría',
  },
  {
    chunk_text:
      'Sensor de temperatura atascado (stuck): si el valor de temperatura no cambia en varias lecturas ' +
      'sucesivas mientras otros sensores del mismo motor sí cambian, el DS18B20 o su conexión 1-Wire están ' +
      'fallando. Causas: cable dañado, conexión suelta, pull-up faltante, o sensor que se "cuelga" y ' +
      'necesita reinicio. No confundir un valor congelado de un sensor con una temperatura real estable: ' +
      'verificar el timestamp de la última lectura.',
    topic: 'ds18b20_stuck_handling',
    source_reference: 'Guía de hardware del sistema (DS18B20)',
  },
  {
    chunk_text:
      'Pauta de interpretación de umbrales del sistema: los umbrales de los sensores en el panel se ' +
      'configuran según normas (ISO 10816-3 para vibración, NEMA MG-1 para temperatura/corriente). Un ' +
      'valor en warning (zona amarilla) NO exige detención inmediata: exige vigilancia y planificación. ' +
      'Un valor en critical (zona roja) exige acción. Si el operario pregunta "¿qué hago con el motor en ' +
      'warning?", la respuesta correcta prioriza vigilancia y búsqueda de la causa antes que parar.',
    topic: 'threshold_interpretation_policy',
    source_reference: 'Política de umbrales del sistema de telemetría',
  },
  {
    chunk_text:
      'Diferencia entre alarma de sensor y estado del motor: una alarma se dispara por un sensor puntual; ' +
      'el estado del motor (healthy, warning, alarm, under_review, shutting_down, restarting, disabled) ' +
      'resume la condición global. Un motor puede estar en alarm por un solo sensor en critical mientras ' +
      'los demás son normales; o en warning por varios sensores en zona amarilla. Al responder, distinguir ' +
      'claramente qué sensor dispara la alerta y por qué valor.',
    topic: 'alert_vs_motor_state',
    source_reference: 'Modelo de alertas y estados del sistema',
  },
  {
    chunk_text:
      'Rodamiento con juego excesivo (clearance): un rodamiento con holgura interna aumentada produce ' +
      'vibración en dirección radial con picos a múltiplos de la velocidad de giro y golpeteo audible. ' +
      'Causas: desgaste, fatiga del material o montaje con interferencia incorrecta. La vibración aparece ' +
      'cargada cuando el rodamiento es nuevo pero el asiento en la tapa está gastado (el rodamiento "gira" ' +
      'sobre la tapa y la desgasta). Verificar también el juego de las jaulas y el estado del asiento.',
    topic: 'bearing_clearance_wear',
    source_reference: 'SKF - holgura interna de rodamientos',
  },
  {
    chunk_text:
      'Carga axial sobre el rodamiento: una carga axial excesiva sobre el rodamiento del motor produce ' +
      'vibración axial elevada y calentamiento del rodamiento. Causas típicas: correa demasiado tensa con ' +
      'componente axial, ventilador o polea con empuje, motor montado con desalineación angular. Si la ' +
      'vibración axial es mayor que la radial en un motor sano, sospechar primero de la carga axial impuesta ' +
      'por la máquina accionada y no del rodamiento en sí.',
    topic: 'bearing_axial_load',
    source_reference: 'SKF - cargas axiales en rodamientos',
  },
  {
    chunk_text:
      'Acoplamiento rígido vs elástico: un acoplamiento rígido transmite toda la vibración y desalineación ' +
      'entre ejes; un elástico la amortigua en parte. Si la máquina accionada (bomba, ventilador) vibra, la ' +
      'vibración puede llegar al motor a través del acoplamiento. Por eso una vibración alta del motor no ' +
      'siempre es falla del motor: verificar el estado del acoplamiento y de la máquina accionada ANTES de ' +
      'concluir. La separación correcta entre ejes según el acoplamiento también evita cargas axiales.',
    topic: 'coupling_vibration_transfer',
    source_reference: 'Fabricantes de acoplamientos - transmisión de vibración',
  },
  {
    chunk_text:
      'Alineación por método de borde y cara (rim and face): tolerancia recomendada para motores acoplados ' +
      'a bombas y ventiladores: desalineación paralela ≤0.05 mm (2 milésimas) y angular ≤0.05 mm/100 mm ' +
      'para velocidades de 1500-3000 rpm. Para velocidades menores, tolerancias un poco más amplias. La ' +
      'alineación con láser alcanza estas tolerancias en minutos; la alineación con regla y sonda es más ' +
      'tosca. La desalineación no corregida sobrecarga los rodamientos y aumenta la vibración a 2X.',
    topic: 'alignment_rim_face_tolerance',
    source_reference: 'ISO/TS 16949 / fabricantes de alineadores',
  },
  {
    chunk_text:
      'El desbalance de un ventilador de tiro inducido (succión de gases calientes) es causado casi siempre ' +
      'por acumulación de ceniza o hollín en los álabes; la limpieza periódica de álabes es más efectiva ' +
      'que el balanceo dinámico cuando la suciedad es la causa. La vibración por desbalance aparece a 1X y ' +
      'crece con el tiempo de servicio desde la última limpieza. Si la vibración se mantiene tras la ' +
      'limpieza, recién entonces planificar balanceo dinámico.',
    topic: 'fan_induced_draft_soot',
    source_reference: 'AMCA - ventiladores de tiro inducido',
  },
  {
    chunk_text:
      'Bombas con recirculación mínima: las bombas centrífugas no deben operar por debajo del flujo mínimo ' +
      'recomendado; la recirculación interna calienta el líquido y puede vaporizarlo, produciendo ' +
      'cavitación interna y desgaste. Síntoma: ruido de "golpeteo" y vibración con temperatura del líquido ' +
      'en aumento, incluso con flujo neto bajo. Muchas bombas tienen una válvula de recirculación mínima ' +
      'automática. Si la corriente del motor es baja (baja carga) pero la bomba vibra y calienta, verificar ' +
      'si está operando bajo el flujo mínimo.',
    topic: 'pump_minimum_flow',
    source_reference: 'Hydraulic Institute - flujo mínimo de bombas',
  },
  {
    chunk_text:
      'El factor de potencia de un motor de inducción en vacío es bajo (0.1-0.2) porque la corriente que ' +
      'consume es mayormente magnetizante; a plena carga sube a 0.8-0.9. Un factor de potencia bajo con ' +
      'carga normal sugiere sobredimensionamiento del motor (motor grande para carga pequeña) o tensión ' +
      'alta. Un motor sobredimensionado opera ineficiente y con mayor corriente magnetizante: si el motor ' +
      'trabaja habitualmente por debajo del 50% de carga, evaluar cambiar a un motor menor.',
    topic: 'power_factor_motor_sizing',
    source_reference: 'NEMA MG-1 / IEEE - factor de potencia',
  },
  {
    chunk_text:
      'Sobredimensionamiento de motores: un motor que trabaja permanentemente al 30-40% de su carga nominal ' +
      'tiene menor eficiencia (la eficiencia cae en cargas bajas), peor factor de potencia y mayor corriente ' +
      'sin carga. Regla de eficiencia: los motores IE3/IE4 rinden máximo cerca de 75-100% de carga. Si los ' +
      'datos del panel muestran corriente constantemente baja con carga estable, evaluar el tamaño del motor ' +
      'respecto a la carga real antes de sospechar falla.',
    topic: 'motor_oversizing',
    source_reference: 'IEC 60034-30 / EPRI - eficiencia en carga parcial',
  },
  {
    chunk_text:
      'Clases de aislamiento y temperatura ambiente: la clase de aislamiento define la temperatura máxima ' +
      'del bobinado: Clase F = 155°C, Clase H = 180°C (la más común en motores nuevos), Clase B = 130°C. ' +
      'La temperatura ambiente de 40°C es el estándar de referencia; cada 10°C de ambiente adicional reduce ' +
      'la vida del aislamiento a la mitad. En ambientes calientes (cerca de hornos, verano extremo), un ' +
      'motor puede estar operando dentro de su clase pero con vida útil reducida por el ambiente.',
    topic: 'insulation_classes_ambient',
    source_reference: 'NEMA MG-1 / IEC 60085 - clases de aislamiento',
  },
  {
    chunk_text:
      'Arranques frecuentes y calentamiento del bobinado: cada arranque calienta el bobinado más que la ' +
      'operación en régimen. En motores medianos, un arranque equivale a aproximadamente 10-30 segundos de ' +
      'plena carga en términos de calentamiento (depende de la inercia y del método). Por eso los relés de ' +
      'sobrecarga y los soft-starters limitan la cantidad de arranques por hora. Si un motor arranca muy ' +
      'seguido (p. ej., ciclo corto de un proceso), la temperatura del bobinado sube aun con carga baja.',
    topic: 'frequent_starting_heating',
    source_reference: 'IEC 60034-1 - arranques y calentamiento',
  },
  {
    chunk_text:
      'El arranque Y-Δ y el contacto de transición: en el arranque estrella-triángulo, el contacto que más ' +
      'se desgasta es el de la transición (puede haber arco y soldadura de contactos). Síntomas de contacto ' +
      'defectuoso: el motor arranca en estrella pero no conmuta a triángulo, o conmuta con chisporroteo; la ' +
      'corriente no baja al conmutar; el motor zumba y vibra. Revisar y reemplazar contactos periódicamente. ' +
      'La transición brusca también genera picos de corriente y par que estresan el motor.',
    topic: 'star_delta_contact_wear',
    source_reference: 'NEMA - arranques Y-Δ y contactos',
  },
  {
    chunk_text:
      'VFD con frenado regenerativo: al frenar una carga con alta inercia (ventiladores grandes, centrífugas), ' +
      'el motor se convierte en generador y devuelve energía al bus DC del VFD, elevando su tensión. Si no ' +
      'hay resistor de frenado, el VFD dispara por sobrevoltaje del bus. Soluciones: resistor de frenado con ' +
      'disipación dimensionada, o aumentar el tiempo de desaceleración. Si el VFD "salta" por ' +
      'overvoltage/overcurrent en el frenado, sospechar esto y no un fallo del motor.',
    topic: 'vfd_regenerative_braking',
    source_reference: 'Fabricantes de VFD - frenado regenerativo',
  },
  {
    chunk_text:
      'Cable de motor a VFD: los cables largos entre VFD y motor generan ondas reflejadas que pueden dañar ' +
      'el aislamiento (reflexiones con sobretensión). Regla NEMA MG-1 Part 31: cables de más de ~15-30 m ' +
      '(según el VFD) requieren filtro de salida (dv/dt) o motor con aislamiento reforzado. Síntomas de ' +
      'daño por reflexión: fallas de aislamiento a tierra repetidas sin causa térmica. Verificar la ' +
      'longitud y el tipo de cable cuando un motor con VFD falla eléctricamente sin sobrecarga.',
    topic: 'vfd_cable_length_reflection',
    source_reference: 'NEMA MG-1 Part 31 - longitud de cable VFD',
  },
  {
    chunk_text:
      'El sensor de corriente del sistema mide la corriente RMS por fase o total. Picos breves de corriente ' +
      '(arranque) pueden leerse como valores altos momentáneos; el sistema filtra y guarda lecturas ' +
      'periódicas. Si el operario ve corriente alta sostenida (>1.05× nominal), es sobrecarga real; si ve ' +
      'picos aislados altos al arrancar, son normales. No confundir un pico transitorio de arranque con una ' +
      'falla sostenida de sobrecarga.',
    topic: 'current_reading_interpretation',
    source_reference: 'Especificación de sensores del sistema',
  },
  {
    chunk_text:
      'Rango de medición del sensor de vibración: el acelerómetro del sistema mide la vibración en mm/s RMS ' +
      '(velocidad) en un rango típico de 0 a 20-25 mm/s, cubriendo desde motor sano (~0.5 mm/s) hasta zona ' +
      'crítica (>7 mm/s). Valores por encima del rango del sensor se reportan como out_of_range. Si el ' +
      'sensor indica out_of_range, no es que la máquina tenga vibración infinita: es que la señal supera el ' +
      'rango de medición del sensor.',
    topic: 'vibration_sensor_range',
    source_reference: 'Especificación de sensores del sistema',
  },
  {
    chunk_text:
      'Montaje del sensor de vibración: el acelerómetro debe montarse rígido y plano sobre la carcasa del ' +
      'motor (idealmente en la tapa del rodamiento), sin grasa ni materiales blandos entre sensor y ' +
      'superficie, porque eso amortigua la señal. Si el sensor está montado sobre un soporte flexible, las ' +
      'lecturas serán atenuadas o con resonancia del soporte. Un cambio de lectura brusco tras un ' +
      'mantenimiento puede ser por re-montaje del sensor y no por el motor.',
    topic: 'vibration_sensor_mounting',
    source_reference: 'ISO 10816-1 / guía de instalación de sensores',
  },
  {
    chunk_text:
      'Diferencias entre lecturas de temperatura de superficie y de rodamiento: el sensor de temperatura del ' +
      'sistema mide la temperatura de superficie del motor (típicamente carcasa cerca del bobinado o de los ' +
      'rodamientos). La temperatura interna del bobinado es mayor (puede ser 20-30°C más alta que la de ' +
      'superficie) y la del rodamiento es mayor que la de la tapa externa. Al interpretar: la superficie no ' +
      'debe superar ~70-80°C en operación normal; si la superficie supera 90°C, el bobinado ya está ' +
      'cerca de su límite.',
    topic: 'surface_temp_vs_internal',
    source_reference: 'NEMA MG-1 / práctica de monitoreo',
  },
  {
    chunk_text:
      'Vibración a 1X con fase inestable: si la vibración a 1X cambia de amplitud y fase entre lecturas o ' +
      'según el momento del día, sospechar: vibración transmitida por el piso (resonancia de la fundación o ' +
      'de estructuras vecinas), juego mecánico, o desbalance variable (depósitos que se desprenden). Si es ' +
      'estable, es desbalance clásico. La inestabilidad de fase requiere análisis con medidor de fase; en el ' +
      'panel, se observa como vibración que "no se comporta" de manera repetible.',
    topic: 'vibration_1x_unstable_phase',
    source_reference: 'ISO 13373 - fase de vibración',
  },
  {
    chunk_text:
      'Vibración por resonancia estructural: cuando la velocidad de giro coincide con la frecuencia natural ' +
      'de la fundación, placa o estructura, la vibración se amplifica (amplitud muy superior a la real de la ' +
      'máquina). La solución NO es balancear: es cambiar la rigidez de la estructura o la velocidad de ' +
      'operación. Un motor nuevo montado en una estructura flexible que vibra a 1X probablemente tiene ' +
      'resonancia de la fundación, no desbalance. Rigidizar la base o cambiar la velocidad lo confirma.',
    topic: 'structural_resonance',
    source_reference: 'ISO 10816-1 / análisis de resonancia estructural',
  },
  {
    chunk_text:
      'Normas de vibración para bombas: además de ISO 10816-3 (motor), la vibración de bombas se evalúa con ' +
      'ISO 10816-7 o API 610 según el tipo. Para bombas centrífugas montadas en su base, la zona límite de ' +
      'vibración de la carcasa es de ~2.8 mm/s (RMS, banda ancha) en condición aceptable. Una bomba con ' +
      'vibración radial alta y espectro con pico a la frecuencia de álabes (BPF) sugiere cavitación o ' +
      'interacción con la voluta, no falla del rodamiento.',
    topic: 'pump_vibration_standards',
    source_reference: 'ISO 10816-7 / API 610 - vibración de bombas',
  },
  {
    chunk_text:
      'Análisis de vibración en arranque (run-up): algunos defectos solo aparecen en la velocidad de ' +
      'resonancia durante el arranque o parada, no en régimen. Un motor que vibra al pasar por cierta ' +
      'velocidad y "se calma" en régimen tiene resonancia de la estructura o del conjunto. Si el operario ' +
      'observa que el motor "tiembla" al arrancar y parar pero el panel muestra valores normales en régimen, ' +
      'indicar que la vibración transitoria de arranque/parada puede no reflejarse en las lecturas ' +
      'periódicas del sistema.',
    topic: 'runup_transient_vibration',
    source_reference: 'ISO 13373 - vibración transitoria',
  },
  {
    chunk_text:
      'Vibración de baja frecuencia (subarmónicos): picos a 0.5X o 1.5X de la velocidad indican holgura ' +
      'mecánica (juego entre piezas) o defectos de jaula de rodamiento. Picos a 1X con armónicos laterales ' +
      'a frecuencias muy bajas indican modulación por excentricidad del rotor o por carga variable. Los ' +
      'subarmónicos son señal casi siempre de juego o daño de jaula, y su aparición requiere inspección ' +
      'mecánica aunque la vibración total esté en zona B.',
    topic: 'subharmonic_vibration',
    source_reference: 'ISO 13373 - subarmónicos',
  },
  {
    chunk_text:
      'Corriente de rotor en barras rotas: en un motor con barras del rotor agrietadas, la corriente en ' +
      'régimen oscila con el doble de la frecuencia de deslizamiento (2×s×f, típicamente 0.5-3 Hz). En el ' +
      'panel, se ve como una corriente que "flota" o fluctúa lentamente en lugar de ser estable. Los picos ' +
      'de vibración a 1X con bandas laterales separadas por 2×s×f acompañan al defecto. Un motor con ' +
      'barras rotas pierde par bajo carga y puede disparar el relé térmico por sobrecorriente local.',
    topic: 'rotor_bar_current_fluctuation',
    source_reference: 'IEEE 1415 - diagnóstico de rotor de jaula',
  },
  {
    chunk_text:
      'Diagnóstico de ruido de "silbido" del bobinado: un silbido agudo de 100-120 Hz (2× la frecuencia de ' +
      'red) que acompaña al motor en marcha puede indicar: bobinas sueltas en las ranuras, entrehierro ' +
      'asimétrico, o vibración magnética del núcleo. El ruido magnético es normal en motores en menor grado; ' +
      'si aumenta o se vuelve metálico, sospechar bobina floja o excentricidad del rotor. Combinar con ' +
      'vibración a 2×f de red y corriente sin carga para confirmar.',
    topic: 'winding_whine_diagnosis',
    source_reference: 'NEMA / diagnóstico acústico de motores',
  },
  {
    chunk_text:
      'Plan de mantenimiento preventivo por condición: definir para cada motor crítico: línea base de ' +
      'vibración y temperatura, umbrales de alerta (zona B/C), frecuencia de medición (semanal en ' +
      'motores críticos, mensual en el resto), y acciones ante cada zona. El sistema monitorea en línea, ' +
      'pero la medición manual periódica con equipo portátil complementa (detecta alta frecuencia y ' +
      'dirección). Documentar cada intervención para correlacionar tendencias de la máquina.',
    topic: 'cbm_plan_definition',
    source_reference: 'ISO 18436 / prácticas de mantenimiento por condición',
  },
];
