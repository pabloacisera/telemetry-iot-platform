import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveContextService } from './live-context.service';
import { KnowledgeSearchService } from './knowledge-search.service';

export interface RagResponse {
  answer: string;
  sources: string[];
  warnings: string[];
}

/**
 * Orchestrates the full RAG pipeline:
 * 1. Build live context (if motor_id provided)
 * 2. Search knowledge base by similarity
 * 3. Assemble prompt and call Groq LLM
 * 4. Apply anti-hallucination filter
 */
@Injectable()
export class RagQueryService {
  private readonly logger = new Logger(RagQueryService.name);
  private readonly groqApiKey: string;
  private readonly groqModel: string;

  constructor(
    private readonly liveContextService: LiveContextService,
    private readonly knowledgeSearchService: KnowledgeSearchService,
    private readonly configService: ConfigService,
  ) {
    this.groqApiKey = this.configService.get<string>('GROQ_API_KEY', '');
    this.groqModel = this.configService.get<string>(
      'GROQ_MODEL',
      'llama-3.3-70b-versatile',
    );
  }

  /** Execute a RAG query. */
  async query(
    motorId: number | undefined,
    question: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<RagResponse> {
    const warnings: string[] = [];
    const sources: string[] = [];

    // Step 1: Build live context (if motor-specific)
    let liveContextBlock = '';
    let faultSensors: string[] = [];

    if (motorId) {
      const ctx = await this.liveContextService.buildContext(motorId);
      if (!ctx) {
        return {
          answer: `No se encontró el motor ${motorId} en el sistema.`,
          sources: [],
          warnings: [],
        };
      }

      liveContextBlock = this.liveContextService.formatForPrompt(ctx);

      // Track which sensors are in fault (for anti-hallucination filter)
      faultSensors = ctx.sensors
        .filter((s) =>
          ['fault', 'fault_persistent', 'stuck'].includes(s.status),
        )
        .map((s) => s.sensorType);

      // Check for disconnected sensors (no data)
      const disconnected = ctx.sensors.filter((s) => s.value === null);
      if (disconnected.length > 0) {
        for (const s of disconnected) {
          warnings.push(
            `Sin datos recientes para el sensor de ${s.sensorType} (estado: ${s.status}).`,
          );
        }
      }

      // If all sensors disconnected, return early
      if (disconnected.length === ctx.sensors.length) {
        return {
          answer: `No tengo lecturas recientes del motor ${motorId}. Todos los sensores están desconectados o sin datos. Revisá el panel de Grafana para información histórica.`,
          sources: [],
          warnings,
        };
      }
    }

    // Step 2: Search knowledge base
    const knowledgeResults = await this.knowledgeSearchService.search(question);

    let knowledgeBlock = '';
    if (knowledgeResults.length > 0) {
      knowledgeBlock = '## Relevant knowledge base fragments\n\n';
      for (const fragment of knowledgeResults) {
        knowledgeBlock += `- [${fragment.topic}] ${fragment.chunkText}\n  (Source: ${fragment.sourceReference})\n\n`;
        sources.push(fragment.sourceReference);
      }
    }

    // Step 3: Check if this is a historical question
    if (this.isHistoricalQuestion(question) && !knowledgeResults.length) {
      return {
        answer: `Esa pregunta requiere datos de más de 4 horas de antigüedad. Para consultar históricos, tendencias y gráficos avanzados, accedé a Grafana: http://localhost:4002 (usuario: admin). Ahí podés ver dashboards con datos agregados por hora de todos los motores y sensores.`,
        sources: [],
        warnings,
      };
    }

    // Step 4: If no context at all (no motor, no knowledge matches)
    if (!liveContextBlock && knowledgeResults.length === 0) {
      return {
        answer: `No tengo suficiente información para responder esa pregunta. Si estás consultando sobre un motor específico, entrá a la vista de detalle de ese motor y preguntame desde ahí.`,
        sources: [],
        warnings,
      };
    }

    // Step 5: Assemble prompt and call LLM
    const systemPrompt = this.buildSystemPrompt(faultSensors);
    const userPrompt = this.buildUserPrompt(
      question,
      liveContextBlock,
      knowledgeBlock,
    );

    const llmResponse = await this.callGroq(systemPrompt, userPrompt, history);

    // Step 6: Anti-hallucination filter
    const filteredAnswer = this.applyAntiHallucinationFilter(
      llmResponse,
      faultSensors,
    );

    if (faultSensors.length > 0) {
      warnings.push(
        `Sensores en estado de falla (datos no confiables): ${faultSensors.join(', ')}.`,
      );
    }

    return {
      answer: filteredAnswer,
      sources,
      warnings,
    };
  }

  /** Build the system prompt with anti-hallucination rules. */
  private buildSystemPrompt(faultSensors: string[]): string {
    let prompt = `Eres un asistente técnico especializado en motores industriales.

PRINCIPIO FUNDAMENTAL: Respondé EXACTAMENTE lo que te pregunta el operario — ni más ni menos. No agregues secciones, tablas, diagnósticos ni pasos que no se pidieron. Si la pregunta es informativa ("¿cuántas fallas hubo?", "comparame los sensores"), respondé eso con precisión y nada más. Un operario que pregunta una cosa no quiere que le rellenes con lo demás.

PASOS DE ACCIÓN: Incluilos ÚNICAMENTE si la pregunta pide acción o pasos de forma explícita (p. ej. "¿qué hago?", "¿cómo lo arreglo?", "¿qué pasos sigo?", "¿qué debo hacer?"). Si los incluís, cada paso debe estar anclado a un dato concreto del contexto (sensor, valor, umbral, tendencia, hora del último evento). PROHIBIDO inventar pasos genéricos ("realizar mantenimiento preventivo", "limpiar y lubricar", "monitorear de cerca", "verificar carga y equilibrio") que no estén justificados por los datos del contexto o por una norma citada. Si no hay evidencia para un paso específico, decilo y pedí el dato faltante en lugar de rellenar.

REGLA DE ORO: El operario YA VE los valores en el dashboard. Tu valor agregado es el POR QUÉ y el QUÉ HACER cuando te lo piden. No rellenes la respuesta repitiendo en tablas todo lo que ya está en pantalla.

REGLAS OBLIGATORIAS:
1. Responde SIEMPRE en español.
2. Respondé la pregunta tal como se hace: directo y sin bloques artificiales. Si todo está normal, confirmalo brevemente y no inventes acciones.
3. Compará los valores CONFIABLES con sus umbrales y su tendencia (subiendo/estable/bajando). Decí explícitamente si cada valor relevante está normal, en advertencia o crítico.
4. NO repitas en tablas todos los valores que el operario ya ve en el dashboard. Mostrá SOLO los que aportan al diagnóstico: los anormales, los en evolución, o las correlaciones entre señales.
5. Un sensor en falla reporta datos NO CONFIABLES: mostrá su valor con ⚠️ como simple referencia (nunca omitas el número ni escribas "No confiable" en su lugar), pero NO lo clasifiques como normal/advertencia/crítico y NO uses sus valores para correlaciones ni conclusiones mecánicas o eléctricas.
6. Para preguntas históricas (semana pasada, tendencias largas), redirigí a Grafana.
7. Nunca inventes valores, causas ni procedimientos que no estén respaldados por los datos del contexto o por normas industriales conocidas (ISO 10816-3, NEMA MG-1, etc.). Cuando cites una norma, mencioná la fuente.
8. Usá fechas y horas legibles (nunca ISO crudo).
9. FORMATO: Para datos numéricos, comparaciones y valores vs umbrales, usá TABLAS MARKDOWN. Para pasos de acción (solo si se pidieron), usá lista numerada. Usá **negrita** para valores críticos o acciones urgentes.
10. Nunca digas "no tengo información" si los datos están en el contexto que recibiste.
11. Si TODOS los sensores de un motor entran en falla al mismo tiempo, la causa más probable es de COMUNICACIÓN o del microcontrolador (ESP32): corte de red, reinicio del ESP32 o pérdida de alimentación. NO son tres fallas físicas independientes de sensores. Los valores que se ven son los últimos recibidos antes del corte (datos congelados). Explicá esto y priorizá la verificación de la conexión/poder del MCU ANTES que el reemplazo de sensores.
12. Si el operario pega datos en la pregunta (series de números, horas, tablas), usalos como insumo del diagnóstico: interpretalos, no los ignores ni los repitas sin análisis.
13. Terminá la respuesta cuando hayas respondido la pregunta. PROHIBIDO cerrar resumiendo lo ya dicho ("en cuanto a la pregunta del operador...", "es importante tener en cuenta que...", "en resumen..."). Tampoco copies el formato ni los pasos de tus respuestas anteriores: cada respuesta debe adaptarse a la pregunta actual.

COMPORTAMIENTO POR ESTADO DEL MOTOR:
- **Saludable**: confirmar operación normal con tabla de valores. Decir "no se requiere acción".
- **Alarma (alarm)**: el sistema detectó lecturas anómalas consecutivas (N, configurable por motor). Explicar cuál sensor las provocó y recomendar: monitorear de cerca, reinicio preventivo, o detención según la severidad.
- **Reiniciando**: esperar los 100 segundos del ciclo. Advertir que si vuelve a fallar tras el reinicio, el motor quedará Deshabilitado.
- **Deshabilitado**: ya se agotaron los reinicios automáticos. Obligatorio recomendar inspección física antes de reactivar. Explicar qué sensor o patrón causó la deshabilitación.
- **Parada manual**: detenido por operador. Puede reiniciarse cuando se considere seguro. Si hay sensores en falla, mencionarlo.
- **Deteniendo (shutting_down)**: en proceso de parada. No interrumpir el ciclo.

LÓGICA DEL SISTEMA (para el diagnóstico):
- El motor entra en "Alarma" cuando un sensor acumula N lecturas consecutivas anómalas (N configurable, por defecto 5). Las lecturas anómalas son las que superan warning_max sin llegar a critical_max.
- Tras entrar en "Alarma", el operario tiene un período de gracia (configurable, por defecto 2 minutos) para intervenir antes del trip automático.
- Una sola lectura crítica (supera critical_max) dispara el trip INMEDIATO ("Deteniendo"), sin esperar la ventana de gracia ni acumular lecturas.
- Si el operario no interviene, el sistema hace trip → "Deteniendo" → intento de reinicio automático (1 intento).
- Tras un reinicio, el motor entra en cooldown (mínimo 5 minutos): se requieren 2N lecturas consecutivas para volver a alarmar y una lectura crítica ya no dispara el trip inmediato.
- Si el problema persiste tras el reinicio → "Deshabilitado".
- Un sensor en falla no participa en la evaluación de salud del motor.

DATOS DISPONIBLES: Tenés acceso al historial de lecturas de las últimas 4 horas (MySQL). Si el operario pregunta por los últimos minutos u horas, respondé con los datos del contexto. Para más de 4 horas, redirigí a Grafana: http://localhost:4002 (usuario: admin).`;

    if (faultSensors.length > 0) {
      prompt += `\n\nATENCIÓN — SENSORES EN FALLA: Los siguientes sensores tienen estado de falla: ${faultSensors.join(', ')}. Sus valores numéricos están disponibles en el contexto y DEBES mostrarlos como siempre, pero agregá una advertencia ⚠️ junto al valor indicando que el sensor está en falla. NUNCA omitas el número ni escribas "No confiable" en su lugar. IMPORTANTE: NO clasifiques estos valores como normal/advertencia/crítico y NO los uses para correlaciones ni conclusiones — son datos no confiables que solo se muestran como referencia.`;
    }

    return prompt;
  }

  /** Build the user prompt combining all context blocks. */
  private buildUserPrompt(
    question: string,
    liveContext: string,
    knowledgeBlock: string,
  ): string {
    let prompt = '';

    if (liveContext) {
      prompt += `${liveContext}\n\n`;
    }

    if (knowledgeBlock) {
      prompt += `${knowledgeBlock}\n\n`;
    }

    prompt += `## Operator question\n${question}`;

    return prompt;
  }

  /** Call Groq LLM via REST API. Includes the recent conversation as context. */
  private async callGroq(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    if (!this.groqApiKey) {
      this.logger.warn(
        'GROQ_API_KEY not configured, returning fallback response',
      );
      return 'El asistente de IA no está configurado (falta la clave de API). Contactá al administrador.';
    }

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Recent conversation turns give the LLM context for follow-up questions.
    for (const turn of history) {
      if (turn.content && turn.content.length > 0) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }

    messages.push({ role: 'user', content: userPrompt });

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.groqModel,
            messages,
            temperature: 0.7,
            max_tokens: 1024,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Groq API error (${response.status}): ${errorBody}`);
        return 'No pude procesar tu pregunta en este momento. Intentá de nuevo en unos segundos.';
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content ?? 'No se generó respuesta.';
    } catch (error) {
      this.logger.error(`Groq API call failed: ${(error as Error).message}`);
      return 'No pude procesar tu pregunta en este momento. Intentá de nuevo en unos segundos.';
    }
  }

  /**
   * Anti-hallucination filter: cuando el LLM cita valores de sensores en falla,
   * agrega una advertencia visual junto al número pero NO lo elimina.
   * El operario necesita ver el dato aunque sea sospechoso.
   */
  applyAntiHallucinationFilter(
    response: string,
    faultSensors: string[],
  ): string {
    if (faultSensors.length === 0) return response;

    let filtered = response;

    for (const sensorType of faultSensors) {
      // Patrón: tipo de sensor seguido de un número con unidad
      const pattern = new RegExp(
        `(${sensorType}[^.]*?)(\\d+\\.?\\d*)\\s*(mm\\/s|°C|A|amps?)`,
        'gi',
      );

      // Conservar el valor original, solo agregar la advertencia al lado
      filtered = filtered.replace(pattern, (_match, prefix, value, unit) => {
        return `${prefix}${value} ${unit} ⚠️(sensor en falla)`;
      });
    }

    return filtered;
  }

  /** Detect if a question is asking about deep history (>4 hours). */
  private isHistoricalQuestion(question: string): boolean {
    const historicalPatterns = [
      /last\s+(week|month|year)/i,
      /semana\s+pasada/i,
      /mes\s+pasado/i,
      /año\s+pasado/i,
      /hace\s+\d+\s+(días|semanas|meses)/i,
      /\d+\s+(days?|weeks?|months?)\s+ago/i,
      /ayer/i,
      /la\s+semana\s+anterior/i,
    ];

    return historicalPatterns.some((pattern) => pattern.test(question));
  }
}
