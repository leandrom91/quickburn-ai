import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../../firestore/firestore.service';
import { AgentLoggerService } from '../../telemetry/agent-logger.service';

@Injectable()
export class ScheduleTools {
  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly logger: AgentLoggerService,
  ) {}

  async getCurrentSchedule(userId: string) {
    this.logger.logToolCall('ScheduleAgent', 'get_current_schedule', { userId });
    const profile = await this.firestoreService.getUserProfile(userId);
    const schedule = profile ? profile.schedule : { next_workout: new Date().toISOString(), preferred_days: [] };
    this.logger.logToolResult('get_current_schedule', schedule);
    return schedule;
  }

  async checkRestWindowValidity(lastWorkoutIso: string, proposedTimeIso: string) {
    this.logger.logToolCall('ScheduleAgent', 'check_rest_window_validity', { lastWorkoutIso, proposedTimeIso });

    const last = new Date(lastWorkoutIso).getTime();
    const proposed = new Date(proposedTimeIso).getTime();
    const diffHours = (proposed - last) / (1000 * 60 * 60);

    // Regla RN-01: Descanso obligatorio de al menos 36 horas entre sesiones HIIT
    const restValid = diffHours >= 36;
    const result = {
      restValid,
      diferencia_horas: Math.round(diffHours),
      minimo_requerido_horas: 36,
      mensaje: restValid
        ? 'Ventana de descanso respetada correctamente (>= 36h).'
        : `Violación de Regla Deportiva RN-01: Solo se han dado ${Math.round(diffHours)}h de descanso. Se requiere un mínimo de 36h para prevenir sobreentrenamiento.`,
    };

    this.logger.logToolResult('check_rest_window_validity', result);
    return result;
  }

  async updateNextWorkoutDate(userId: string, newIsoDate: string) {
    this.logger.logToolCall('ScheduleAgent', 'update_next_workout_date', { userId, newIsoDate });
    const profile = await this.firestoreService.getUserProfile(userId);
    if (profile) {
      profile.schedule.next_workout = newIsoDate;
      await this.firestoreService.saveUserProfile(profile);
    }
    const result = { success: true, nueva_fecha: newIsoDate };
    this.logger.logToolResult('update_next_workout_date', result);
    return result;
  }
}
