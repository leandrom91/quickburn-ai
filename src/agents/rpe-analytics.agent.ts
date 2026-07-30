import { Injectable } from '@nestjs/common';
import { RpeTools } from './tools/rpe.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { LlmGeneratorService } from './llm-generator.service';

@Injectable()
export class RpeAnalyticsAgent {
  constructor(
    private readonly rpeTools: RpeTools,
    private readonly logger: AgentLoggerService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async processRpeReport(userId: string, userInput: string): Promise<string> {
    this.logger.logChainOfThought('RpeAnalyticsAgent', `Procesando feedback de RPE y nivel de fatiga.`);

    const matchRpe = userInput.match(/rpe\s*(\d+)/i) || userInput.match(/(\d+)\s*\/\s*10/);

    if (!matchRpe) {
      return `📊 Para registrar el esfuerzo de tu entrenamiento completado, por favor indícame tu nivel de fatiga RPE del 1 al 10 (ej: *"Terminé con RPE 8/10"*).`;
    }

    const rpeScore = parseInt(matchRpe[1], 10);
    const durationMin = 15;

    await this.rpeTools.logSessionCompletion(userId, durationMin, rpeScore);
    const adjustment = await this.rpeTools.adjustConditioningMultiplier(userId, rpeScore);
    const history = await this.rpeTools.fetchWorkoutHistory(userId, 3);

    let fallbackText = `📊 *REGISTRO DE SESIÓN Y ANÁLISIS DE FATIGA RPE*\n\n`;
    fallbackText += `• *Nivel de esfuerzo (RPE):* ${rpeScore}/10\n`;
    fallbackText += `• *Diagnóstico del Agente:* ${adjustment.recomendacion}\n`;
    fallbackText += `• *Ajuste de Carga Futura:* ${Math.round(adjustment.factorAjuste * 100)}%\n\n`;
    fallbackText += `📈 *Historial Reciente (Últimas ${history.length} sesiones):*\n`;

    history.forEach((h, i) => {
      fallbackText += ` ${i + 1}. RPE ${h.rpe_score}/10 (${h.duracion_minutos} min)\n`;
    });

    fallbackText += `\n¡Excelente trabajo completando la sesión! Descansa e hidrátate bien.`;

    return this.llmGenerator.generateNaturalResponse(
      `Eres el RpeAnalyticsAgent de QuickBurn AI. Felicita al atleta por completar la sesión, analiza conversacionalmente su RPE declarado (${rpeScore}/10) y explícale el ajuste de carga futura de forma muy amigable y cercana.`,
      { rpeDeclarado: rpeScore, diagnostico: adjustment, historial: history },
      userInput,
      fallbackText,
    );
  }
}
