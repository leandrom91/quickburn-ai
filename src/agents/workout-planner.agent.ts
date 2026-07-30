import { Injectable } from '@nestjs/common';
import { WorkoutTools } from './tools/workout.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';
import { LlmGeneratorService } from './llm-generator.service';

@Injectable()
export class WorkoutPlannerAgent {
  constructor(
    private readonly workoutTools: WorkoutTools,
    private readonly logger: AgentLoggerService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async processWorkoutRequest(userId: string, userInput: string): Promise<string> {
    this.logger.logChainOfThought('WorkoutPlannerAgent', `Analizando requerimientos de entrenamiento del atleta ${userId}.`);

    const profile = await this.workoutTools.getUserProfile(userId);

    const matchDuration = userInput.match(/(\d+)\s*(min|minutos)/i);
    const durationMin = matchDuration ? parseInt(matchDuration[1], 10) : 15;

    const exercises = await this.workoutTools.queryExerciseDb(
      'HIIT',
      profile.profile.fitness_level,
      durationMin,
    );

    const routine = {
      routine_name: `HIIT QuickBurn ${profile.profile.fitness_level.toUpperCase()}`,
      duration_minutes: durationMin,
      level: profile.profile.fitness_level,
      exercises: exercises.exercises,
    };

    await this.workoutTools.saveGeneratedRoutine(userId, routine);

    let fallbackText = `🏋️ *¡LISTOS PARA ENTRENAR (${durationMin} MINUTOS)!* 🏋️\n\n`;
    fallbackText += `Diseñé esta sesión especial para tu nivel *${profile.profile.fitness_level.toUpperCase()}*:\n\n`;
    routine.exercises.forEach((ex: any, idx: number) => {
      fallbackText += `${idx + 1}. *${ex.name}* (${ex.category})\n   ⏱️ ${ex.duration_sec}s activo | 🛑 ${ex.rest_sec}s descanso\n`;
    });
    fallbackText += `\n💪 ¡Dale con todo el enfoque! Al terminar, no olvides decirme tu RPE de fatiga (1 al 10) para ajustar la siguiente.`;

    return this.llmGenerator.generateNaturalResponse(
      `Eres el WorkoutPlannerAgent de QuickBurn AI. Presenta al atleta su rutina de entrenamiento HIIT personalizada de manera conversacional, entusiasta y motivadora.`,
      { athlete: profile.name, level: profile.profile.fitness_level, routine },
      userInput,
      fallbackText,
    );
  }
}
