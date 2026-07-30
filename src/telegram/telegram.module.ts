import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { AgentsModule } from '../agents/agents.module';
import { PromptSafetyGuardrails } from '../guardrails/prompt-safety.guardrails';

@Module({
  imports: [AgentsModule],
  controllers: [TelegramController],
  providers: [TelegramService, PromptSafetyGuardrails],
  exports: [TelegramService],
})
export class TelegramModule {}
