import { Injectable } from '@nestjs/common';
import { FirestoreService, UserProfile } from '../../firestore/firestore.service';
import { AgentLoggerService } from '../../telemetry/agent-logger.service';

@Injectable()
export class WorkoutTools {
  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly logger: AgentLoggerService,
  ) {}

  async getUserProfile(userId: string): Promise<UserProfile> {
    this.logger.logToolCall('WorkoutPlannerAgent', 'get_user_profile', { userId });
    let profile = await this.firestoreService.getUserProfile(userId);

    if (!profile) {
      profile = {
        user_id: userId,
        name: 'Athlete',
        current_status: 'Active',
        profile: {
          fitness_level: 'intermediate',
          age: 25,
          weight_kg: 70,
          height_cm: 170,
          bmi: 24.2,
          max_hr_bpm: 195,
          max_weekly_frequency: 3,
          physical_restrictions: [],
        },
        schedule: {
          preferred_days: ['Monday', 'Wednesday', 'Friday'],
          next_workout: new Date().toISOString(),
          weekly_streak: 1,
        },
      };
      await this.firestoreService.saveUserProfile(profile);
    }

    this.logger.logToolResult('get_user_profile', profile);
    return profile;
  }

  async queryExerciseDb(category: string, level: string, durationMin: number) {
    this.logger.logToolCall('WorkoutPlannerAgent', 'query_exercise_db', { category, level, durationMin });

    const exercises = [
      { name: 'Jumping Jacks', category: 'Cardio', duration_sec: 45, rest_sec: 15 },
      { name: 'Burpees', category: 'High Intensity', duration_sec: 30, rest_sec: 30 },
      { name: 'Mountain Climbers', category: 'Core', duration_sec: 40, rest_sec: 20 },
      { name: 'Jump Squats', category: 'Legs', duration_sec: 45, rest_sec: 15 },
      { name: 'Push-ups', category: 'Chest/Triceps', duration_sec: 35, rest_sec: 25 },
      { name: 'High Knees', category: 'Cardio', duration_sec: 40, rest_sec: 20 },
    ];

    const selected = exercises.slice(0, Math.min(4, Math.ceil(durationMin / 3)));
    const result = { format: 'Tabata/EMOM', total_duration_min: durationMin, exercises: selected };
    this.logger.logToolResult('query_exercise_db', result);
    return result;
  }

  async saveGeneratedRoutine(userId: string, routineJson: any) {
    this.logger.logToolCall('WorkoutPlannerAgent', 'save_generated_routine', { userId, routineJson });
    await this.firestoreService.saveRoutine(userId, routineJson);
    const result = { status: 'Saved successfully in Firestore', timestamp: new Date().toISOString() };
    this.logger.logToolResult('save_generated_routine', result);
    return result;
  }
}
