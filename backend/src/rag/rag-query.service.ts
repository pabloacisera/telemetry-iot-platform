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
        answer: `Para datos históricos y tendencias te recomiendo consultar el panel de Grafana, que tiene acceso a las lecturas agregadas por hora. Yo solo puedo responder sobre el estado actual de la planta.`,
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

    const llmResponse = await this.callGroq(systemPrompt, userPrompt);

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
    let prompt = `Eres un asistente técnico de una planta industrial con 15 motores, cada uno con 3 sensores (temperatura, vibración, corriente).

REGLAS OBLIGATORIAS:
1. Responde SIEMPRE en español.
2. Sé conciso, directo y accionable. El operario necesita saber QUÉ HACER, no solo qué pasa.
3. Compara los valores actuales con los umbrales proporcionados. Di explícitamente si un valor está normal, en advertencia o crítico.
4. Si un sensor está en falla, dilo claramente y aclara que su valor no es confiable.
5. Para preguntas históricas (semana pasada, tendencias), redirige a Grafana.
6. Si no tenés suficiente información, decilo — nunca inventes valores ni causas.
7. Cuando cites umbrales o normas, menciona la fuente (ISO 10816-3, NEMA MG-1, etc.).
8. Usa formatos de fecha/hora legibles (nunca ISO crudo).
9. Nunca digas "no tengo información" si los datos están en el contexto que recibiste.

REGLAS DE RECOMENDACIÓN POR ESTADO:
- Si el motor está "En revisión": SIEMPRE recomendar una acción concreta. El motor está en revisión porque se detectaron anomalías. Las opciones son: reiniciar preventivamente, monitorear de cerca los próximos minutos, o detener si los valores son críticos. Nunca digas "no hagas nada" si el motor está en revisión.
- Si el motor está "Saludable": indicar que la operación es normal. Si el operario pregunta igual, confirmar que los valores están dentro de rango.
- Si el motor está "Deshabilitado": SIEMPRE recomendar inspección física antes de reactivar. Explicar que ya se intentó un reinicio automático y falló.
- Si el motor está "Reiniciando": indicar que debe esperar los 100 segundos del ciclo anti-cortocircuito.
- Si el motor está "Parada manual": indicar que fue detenido por un operador y puede reiniciarse cuando se considere seguro.

LÓGICA DE DETECCIÓN: el sistema marca un motor "En revisión" cuando detecta 5 de las últimas 8 lecturas en zona de advertencia, O una sola lectura en zona crítica. Aunque el valor ACTUAL pueda parecer normal, el historial reciente tuvo anomalías. Esto es importante — no digas que "todo está bien" si el motor está en revisión.`;

    if (faultSensors.length > 0) {
      prompt += `\n\nCRÍTICO: Los siguientes sensores están en FALLA — sus valores NO son confiables y NO deben citarse como hechos: ${faultSensors.join(', ')}.`;
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

  /** Call Groq LLM via REST API. */
  private async callGroq(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (!this.groqApiKey) {
      this.logger.warn(
        'GROQ_API_KEY not configured, returning fallback response',
      );
      return 'El asistente de IA no está configurado (falta la clave de API). Contactá al administrador.';
    }

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
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
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
   * Anti-hallucination filter: checks if the LLM response cites numerical values
   * from sensors that are in fault state, and adds warnings if so.
   */
  applyAntiHallucinationFilter(
    response: string,
    faultSensors: string[],
  ): string {
    if (faultSensors.length === 0) return response;

    let filtered = response;

    for (const sensorType of faultSensors) {
      // Pattern: mentions the sensor type followed by a number (potential value citation)
      const pattern = new RegExp(
        `(${sensorType}[^.]*?)(\\d+\\.?\\d*)\\s*(mm\\/s|°C|A|amps?)`,
        'gi',
      );

      filtered = filtered.replace(pattern, () => {
        return `[⚠️ ${sensorType} sensor is in FAULT state — this value is UNRELIABLE]`;
      });
    }

    return filtered;
  }

  /** Detect if a question is asking about deep history. */
  private isHistoricalQuestion(question: string): boolean {
    const historicalPatterns = [
      /last\s+(week|month|year)/i,
      /semana\s+pasada/i,
      /mes\s+pasado/i,
      /histor(y|ical|ico|ia)/i,
      /trend(s)?/i,
      /tendencia/i,
      /over\s+time/i,
      /hace\s+\d+\s+(días|horas|semanas)/i,
      /\d+\s+(days?|weeks?|months?)\s+ago/i,
    ];

    return historicalPatterns.some((pattern) => pattern.test(question));
  }
}
