import { Injectable } from '@nestjs/common';
import { CoachTools } from './tools/coach.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { LlmGeneratorService } from './llm-generator.service';

@Injectable()
export class CoachFollowupAgent {
  constructor(
    private readonly coachTools: CoachTools,
    private readonly logger: AgentLoggerService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async processFollowup(userId: string): Promise<string> {
    this.logger.logChainOfThought('CoachFollowupAgent', `Verificando estado proactivo de entrenamiento.`);

    const status = await this.coachTools.checkUncompletedWorkoutStatus(userId);

    const fallbackMessage = status.tieneEntrenoPendiente
      ? `👋 ¡Hola! Noté que tenías agendado tu entrenamiento HIIT hoy. ¿Lograste completarlo o prefieres que ajustemos el horario para más tarde?`
      : `¡Todo al día! Tu próxima sesión está programada correctamente.`;

    if (status.tieneEntrenoPendiente) {
      await this.coachTools.sendTelegramNotification(userId, fallbackMessage);
    }

    return this.llmGenerator.generateNaturalResponse(
      `Eres el CoachFollowupAgent de QuickBurn AI. Comunícate con el atleta para hacerle un seguimiento proactivo sobre su entrenamiento pendiente de forma amigable, empática y motivadora.`,
      { usuarioId: userId, estadoEntrenamiento: status },
      'Seguimiento proactivo de entrenamiento',
      fallbackMessage,
    );
  }
}
