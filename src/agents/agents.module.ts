import { Module } from '@nestjs/common';
import { OrchestratorAgent } from './orchestrator.agent';
import { WorkoutPlannerAgent } from './workout-planner.agent';
import { ScheduleAgent } from './schedule.agent';
import { RpeAnalyticsAgent } from './rpe-analytics.agent';
import { CoachFollowupAgent } from './coach-followup.agent';
import { AdkSessionService } from './adk-session.service';
import { LlmGeneratorService } from './llm-generator.service';

import { WorkoutTools } from './tools/workout.tools';
import { ScheduleTools } from './tools/schedule.tools';
import { RpeTools } from './tools/rpe.tools';
import { CoachTools } from './tools/coach.tools';
import { AgentLoggerService } from '../telemetry/agent-logger.service';

@Module({
  providers: [
    OrchestratorAgent,
    WorkoutPlannerAgent,
    ScheduleAgent,
    RpeAnalyticsAgent,
    CoachFollowupAgent,
    AdkSessionService,
    LlmGeneratorService,
    AgentLoggerService,
    WorkoutTools,
    ScheduleTools,
    RpeTools,
    CoachTools,
  ],
  exports: [
    OrchestratorAgent,
    CoachFollowupAgent,
    WorkoutPlannerAgent,
    ScheduleAgent,
    RpeAnalyticsAgent,
    AdkSessionService,
    AgentLoggerService,
    LlmGeneratorService,
  ],
})
export class AgentsModule {}
