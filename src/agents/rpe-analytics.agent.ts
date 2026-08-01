import { Injectable } from '@nestjs/common';
import { RpeTools } from './tools/rpe.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { LlmGeneratorService } from './llm-generator.service';
import { FirestoreService } from '../firestore/firestore.service';

@Injectable()
export class RpeAnalyticsAgent {
  constructor(
    private readonly rpeTools: RpeTools,
    private readonly firestoreService: FirestoreService,
    private readonly logger: AgentLoggerService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async processRpeReport(userId: string, userInput: string): Promise<string> {
    this.logger.logChainOfThought('RpeAnalyticsAgent', `Procesando feedback de RPE y nivel de fatiga.`);

    const matchRpe = userInput.match(/rpe\s*(\d+)/i) || userInput.match(/(\d+)\s*\/\s*10/);

    if (!matchRpe) {
      return `📊 Para registrar el esfuerzo de tu entrenamiento completado, por favor indícame tu nivel de fatiga RPE del 1 al 10 (ej: *"Terminé con RPE 8/10"*).`;
    }

    const profile = await this.firestoreService.getUserProfile(userId);
    if (profile?.schedule?.last_completed_workout) {
      const dateStr = String(profile.schedule.last_completed_workout).replace('_', 'T');
      const lastCompleted = new Date(dateStr).getTime();

      if (!isNaN(lastCompleted)) {
        const now = new Date().getTime();
        const hoursDiff = (now - lastCompleted) / (1000 * 60 * 60);

        // Si ya registró RPE en las últimas 4 horas
        if (hoursDiff < 4) {
          return `💪 ¡Hola, ${profile.name}! Ya habías registrado exitosamente tu esfuerzo RPE para la rutina de hoy. Tu ajuste de carga (${Math.round((profile.schedule.load_adjustment_factor || 1.0) * 100)}%) ya está activo en tu perfil de Firestore. ¡Disfruta tu descanso e hidrátate bien! 💧`;
        }
      }
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
      fallbackText += ` ${i + 1}. RPE ${h.rpe_score}/10 (${h.duracion_minutos || durationMin} min)\n`;
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
