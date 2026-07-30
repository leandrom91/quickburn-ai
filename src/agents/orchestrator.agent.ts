import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkoutPlannerAgent } from './workout-planner.agent';
import { ScheduleAgent } from './schedule.agent';
import { RpeAnalyticsAgent } from './rpe-analytics.agent';
import { CoachFollowupAgent } from './coach-followup.agent';
import { AdkSessionService } from './adk-session.service';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { FirestoreService } from '../firestore/firestore.service';
import { getOrchestratorMasterPrompt } from './prompts/orchestrator.prompt';
import { VertexService } from '../vertex/vertex.service';

export enum AgentIntent {
  WORKOUT_REQUEST = 'WORKOUT_REQUEST',
  REPROGRAM_SCHEDULE = 'REPROGRAM_SCHEDULE',
  RPE_REPORT = 'RPE_REPORT',
  COACH_FOLLOWUP = 'COACH_FOLLOWUP',
  GENERAL_CONVERSATION = 'GENERAL_CONVERSATION',
}

@Injectable()
export class OrchestratorAgent {
  private readonly logger = new Logger(OrchestratorAgent.name);
  private modelName: string = 'gemini-2.5-flash';

  constructor(
    private readonly configService: ConfigService,
    private readonly workoutPlannerAgent: WorkoutPlannerAgent,
    private readonly scheduleAgent: ScheduleAgent,
    private readonly rpeAnalyticsAgent: RpeAnalyticsAgent,
    private readonly coachFollowupAgent: CoachFollowupAgent,
    private readonly adkSessionService: AdkSessionService,
    private readonly agentLoggerService: AgentLoggerService,
    private readonly firestoreService: FirestoreService,
    private readonly vertexService: VertexService,
  ) {
    this.modelName = this.configService.get<string>('gemini.modelName') || 'gemini-2.5-flash';
  }

  async handleUserTurn(userId: string, userInput: string, firstName?: string): Promise<string> {
    await this.adkSessionService.addMessage(userId, 'user', userInput);
    this.agentLoggerService.logChainOfThought(
      'OrchestratorAgent',
      `Turno agéntico para atleta ${userId} (${firstName || 'Athlete'}): "${userInput}"`,
    );

    const profile = await this.firestoreService.getUserProfile(userId);
    if (profile && firstName && profile.name !== firstName) {
      profile.name = firstName;
      await this.firestoreService.saveUserProfile(profile);
    }

    const intent = await this.classifyIntentWithLlm(userInput);
    this.agentLoggerService.logChainOfThought('OrchestratorAgent', `Intención clasificada por Vertex AI: [${intent}]`);

    let agentResponse = '';

    switch (intent) {
      case AgentIntent.WORKOUT_REQUEST:
        agentResponse = await this.workoutPlannerAgent.processWorkoutRequest(userId, userInput);
        break;

      case AgentIntent.REPROGRAM_SCHEDULE:
        agentResponse = await this.scheduleAgent.processScheduleRequest(userId, userInput);
        break;

      case AgentIntent.RPE_REPORT:
        agentResponse = await this.rpeAnalyticsAgent.processRpeReport(userId, userInput);
        break;

      case AgentIntent.COACH_FOLLOWUP:
        agentResponse = await this.coachFollowupAgent.processFollowup(userId);
        break;

      case AgentIntent.GENERAL_CONVERSATION:
      default:
        agentResponse = await this.generateGeneralResponse(userId, userInput, firstName || profile?.name || 'Athlete');
        break;
    }

    await this.adkSessionService.addMessage(userId, 'model', agentResponse);
    return agentResponse;
  }

  /**
   * Clasificación de intención 100% agéntica con Vertex AI
   */
  private async classifyIntentWithLlm(userInput: string): Promise<AgentIntent> {
    const classificationPrompt = `
Analiza el mensaje del atleta y clasifica su intención en UNA sola categoría:
1. WORKOUT_REQUEST: Pide entrenar, rutina HIIT, ejercicios o especificar minutos (ej: "dame una rutina de 15 min", "quiero entrenar").
2. REPROGRAM_SCHEDULE: Pide cambiar fecha/hora, posponer o agendar (ej: "cámbiamelo para el viernes", "no puedo hoy").
3. RPE_REPORT: ÚNICAMENTE si reporta explícitamente haber completado un entrenamiento con su puntaje de esfuerzo RPE (ej: "RPE 8/10", "Terminé con RPE 7", "Completé la rutina con RPE 9").
4. COACH_FOLLOWUP: Solo cuando solicite estado técnico de rutinas pendientes del sistema.
5. GENERAL_CONVERSATION: Para cualquier otra charla, comentarios de estar cansado sin haber entrenado ("hoy estoy muy cansado", "no me siento bien"), dudas ("no sé cómo empezar"), saludos o desánimo.

MENSAJE DEL ATLETA: "${userInput}"

Responde ÚNICAMENTE con la palabra de la categoría (ej: WORKOUT_REQUEST o GENERAL_CONVERSATION).
`;

    try {
      const responseText = await this.vertexService.generateContent(classificationPrompt, this.modelName);
      const rawIntent = responseText.trim().toUpperCase();
      if (Object.values(AgentIntent).includes(rawIntent as AgentIntent)) {
        return rawIntent as AgentIntent;
      }
    } catch (err) {
      this.logger.warn(`Clasificación Vertex AI falló: ${err.message}`);
    }

    return AgentIntent.GENERAL_CONVERSATION;
  }

  /**
   * Generación conversacional 100% impulsada por Vertex AI
   */
  private async generateGeneralResponse(userId: string, userInput: string, userName: string): Promise<string> {
    const profile = await this.firestoreService.getUserProfile(userId);
    const history = await this.adkSessionService.getSessionHistory(userId);
    const masterPrompt = getOrchestratorMasterPrompt(
      userName,
      JSON.stringify(profile, null, 2),
      JSON.stringify(history, null, 2),
      userInput,
    );

    try {
      const responseText = await this.vertexService.generateContent(masterPrompt, this.modelName);
      if (responseText && responseText.length > 0) {
        this.agentLoggerService.logChainOfThought('OrchestratorAgent', `Respuesta dinámica Vertex AI generada con ${this.modelName}`);
        return responseText;
      }
    } catch (err) {
      this.logger.warn(`Respuesta general Vertex AI falló: ${err.message}`);
    }

    return `¡Entendido, ${userName}! Como tu coach de HIIT estoy aquí para apoyarte en tu evolución. ¿Qué te gustaría entrenar o ajustar hoy?`;
  }
}
