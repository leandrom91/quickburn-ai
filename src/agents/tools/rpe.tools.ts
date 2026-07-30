import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../../firestore/firestore.service';
import { AgentLoggerService } from '../../telemetry/agent-logger.service';

@Injectable()
export class RpeTools {
  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly logger: AgentLoggerService,
  ) {}

  async fetchWorkoutHistory(userId: string, limitCount = 5) {
    this.logger.logToolCall('RpeAnalyticsAgent', 'fetch_workout_history', { userId, limitCount });
    const history = await this.firestoreService.getWorkoutHistory(userId, limitCount);
    this.logger.logToolResult('fetch_workout_history', history);
    return history;
  }

  async adjustConditioningMultiplier(userId: string, rpeScore: number) {
    this.logger.logToolCall('RpeAnalyticsAgent', 'adjust_conditioning_multiplier', { userId, rpeScore });

    let factorAjuste = 1.0;
    let recomendacion = 'Mantener carga actual';

    if (rpeScore >= 9) {
      factorAjuste = 0.85; // Reducir intensidad un 15% por fatiga alta
      recomendacion = 'Fatiga alta (RPE >= 9). Reduciendo intensidad en la siguiente rutina y sugiriendo más recuperación.';
    } else if (rpeScore <= 5) {
      factorAjuste = 1.15; // Incrementar un 15% por adaptación positiva
      recomendacion = 'Sesión ligera (RPE <= 5). Incrementando nivel de reto para la próxima sesión.';
    }

    const result = { rpeScore, factorAjuste, recomendacion };
    this.logger.logToolResult('adjust_conditioning_multiplier', result);
    return result;
  }

  async logSessionCompletion(userId: string, durationMin: number, rpeScore: number) {
    this.logger.logToolCall('RpeAnalyticsAgent', 'log_session_completion', { userId, durationMin, rpeScore });
    await this.firestoreService.logSessionCompletion(userId, durationMin, rpeScore);
    const result = { status: 'Sesión registrada exitosamente', rpeScore, durationMin };
    this.logger.logToolResult('log_session_completion', result);
    return result;
  }
}
