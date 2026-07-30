import { Injectable } from '@nestjs/common';
import { ScheduleTools } from './tools/schedule.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { LlmGeneratorService } from './llm-generator.service';

@Injectable()
export class ScheduleAgent {
  constructor(
    private readonly scheduleTools: ScheduleTools,
    private readonly logger: AgentLoggerService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async processScheduleRequest(userId: string, userInput: string): Promise<string> {
    this.logger.logChainOfThought('ScheduleAgent', `Evaluando propuesta de reprogramación NLP para el usuario ${userId}.`);

    const currentSchedule = await this.scheduleTools.getCurrentSchedule(userId);
    const lastWorkoutIso = currentSchedule.next_workout || new Date().toISOString();

    const lower = userInput.toLowerCase();
    const isShortTime = lower.includes('4 horas') || lower.includes('hoy en la tarde') || lower.includes('en 2 horas');

    let proposedDate: Date;
    if (isShortTime) {
      proposedDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
    } else {
      proposedDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // Mañana / 48h
    }

    const validation = await this.scheduleTools.checkRestWindowValidity(
      lastWorkoutIso,
      proposedDate.toISOString(),
    );

    const formattedDate = proposedDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (!validation.restValid) {
      const fallbackRejection =
        `⚠️ Escuché tu solicitud de entrenar pronto, pero como tu coach debo cuidar tu salud deportiva.\n\n` +
        `Solo han pasado ${validation.diferencia_horas}h desde tu última sesión y la regla de supercompensación exige al menos 36h de descanso para no sobrecargar las articulaciones.\n\n` +
        `📅 ¿Qué te parece si lo agendamos mejor para el *${formattedDate}*? Así llegarás con máxima energía.`;

      return this.llmGenerator.generateNaturalResponse(
        `Eres el ScheduleAgent de QuickBurn AI. El atleta solicitó una reprogramación que viola la regla de descanso mínimo (36h). Explícale de forma muy empática, conversacional y preocupada por su salud deportiva por qué no es seguro entrenar tan pronto y sugiérele la fecha alternativa adecuada.`,
        { fechaPropuesta: proposedDate, validacion: validation },
        userInput,
        fallbackRejection,
      );
    }

    await this.scheduleTools.updateNextWorkoutDate(userId, proposedDate.toISOString());

    const fallbackSuccess =
      `📅 ¡Perfecto, reprogramación anotada!\n\n` +
      `He actualizado tu agenda para el *${formattedDate}*. Validé tu ventana de descanso (${validation.diferencia_horas}h de recuperación) para que entrenes al 100% de capacidad.\n\n` +
      `¡Nos vemos ese día para romperla! 💪`;

    return this.llmGenerator.generateNaturalResponse(
      `Eres el ScheduleAgent de QuickBurn AI. Confirma al atleta que su reprogramación fue exitosa de forma fluida, amigable y motivadora.`,
      { fechaNueva: proposedDate.toISOString(), ventanaDescansoHoras: validation.diferencia_horas },
      userInput,
      fallbackSuccess,
    );
  }
}
