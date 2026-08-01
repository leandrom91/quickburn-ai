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

    // Validación de descanso obligatorio (Regla RN-01 de 36 horas)
    if (profile?.schedule?.last_completed_workout) {
      const dateStr = String(profile.schedule.last_completed_workout).replace('_', 'T');
      const lastCompleted = new Date(dateStr).getTime();

      if (!isNaN(lastCompleted)) {
        const now = new Date().getTime();
        const hoursDiff = (now - lastCompleted) / (1000 * 60 * 60);

        if (hoursDiff < 36) {
          const hoursRemaining = Math.ceil(36 - hoursDiff);
          return this.llmGenerator.generateNaturalResponse(
            `Eres el WorkoutPlannerAgent de QuickBurn AI. El atleta ${profile.name} intentó solicitar una nueva rutina HIIT solo ${Math.round(hoursDiff)} horas después de su último entrenamiento. Por salud deportiva (Regla RN-01 de supercompensación) y para evitar lesiones, explícale de forma empática y cercana que debe descansar al menos 36 horas entre sesiones. Ofrécele reprogramar su próximo entrenamiento para dentro de unas ${hoursRemaining} horas.`,
            { athlete: profile.name, horasTranscurridas: Math.round(hoursDiff), horasRestantes: hoursRemaining },
            userInput,
            `🛑 *PAUSA DE SEGURIDAD DEPORTIVA (REGLA 36H)*\n\n¡Me encanta tu entusiasmo, *${profile.name}*! 💪 Sin embargo, completaste tu última rutina hace solo ${Math.round(hoursDiff)} horas.\n\nPor salud deportiva y supercompensación muscular (mínimo 36h de descanso), es fundamental permitir que tu cuerpo se recupere para evitar sobreentrenamiento. Te recomiendo descansar hoy y tu próxima rutina estará lista en ${hoursRemaining} horas. 💧`
          );
        }
      }
    }

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
