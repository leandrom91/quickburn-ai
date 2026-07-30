import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../../firestore/firestore.service';
import { AgentLoggerService } from '../../telemetry/agent-logger.service';

@Injectable()
export class CoachTools {
  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly logger: AgentLoggerService,
  ) {}

  async checkUncompletedWorkoutStatus(userId: string) {
    this.logger.logToolCall('CoachFollowupAgent', 'check_uncompleted_workout_status', { userId });
    const profile = await this.firestoreService.getUserProfile(userId);

    const result = {
      tieneEntrenoPendiente: profile ? profile.current_status === 'Active' : true,
      proximoEntreno: profile ? profile.schedule.next_workout : new Date().toISOString(),
    };

    this.logger.logToolResult('check_uncompleted_workout_status', result);
    return result;
  }

  async sendTelegramNotification(userId: string, messageText: string) {
    this.logger.logToolCall('CoachFollowupAgent', 'send_telegram_notification', { userId, messageText });
    const result = { sent: true, userId, timestamp: new Date().toISOString() };
    this.logger.logToolResult('send_telegram_notification', result);
    return result;
  }
}
