import { Injectable } from '@nestjs/common';
import { AgentLoggerService } from '../telemetry/agent-logger.service';

export interface GuardrailResult {
  passed: boolean;
  reason?: string;
}

@Injectable()
export class PromptSafetyGuardrails {
  constructor(private readonly logger: AgentLoggerService) {}

  private readonly forbiddenPatterns = [
    /ignore previous instructions/i,
    /ignore all prompt/i,
    /system prompt/i,
    /drop table/i,
    /eval\(/i,
    /exec\(/i,
    /hack/i,
    /jailbreak/i,
  ];

  validateInput(userInput: string): GuardrailResult {
    for (const pattern of this.forbiddenPatterns) {
      if (pattern.test(userInput)) {
        const reason = `Patrón de Prompt Injection detectado (${pattern})`;
        this.logger.logGuardrailTriggered(reason, userInput);
        return { passed: false, reason };
      }
    }

    if (userInput.trim().length === 0) {
      return { passed: false, reason: 'Mensaje vacío' };
    }

    return { passed: true };
  }
}
