import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AgentLoggerService {
  private readonly logger = new Logger('AgentTelemetry');

  logChainOfThought(agentName: string, reasoning: string) {
    this.logger.log(`\x1b[36m[CoT - ${agentName}]\x1b[0m ${reasoning}`);
  }

  logToolCall(agentName: string, toolName: string, args: any) {
    this.logger.log(
      `\x1b[33m[Tool Exec - ${agentName}]\x1b[0m Running \x1b[1m${toolName}\x1b[0m with args: ${JSON.stringify(args)}`,
    );
  }

  logToolResult(toolName: string, result: any) {
    this.logger.log(
      `\x1b[32m[Tool Result - ${toolName}]\x1b[0m Output: ${JSON.stringify(result)}`,
    );
  }

  logGuardrailTriggered(reason: string, userInput: string) {
    this.logger.warn(
      `\x1b[31m[Guardrail Blocked]\x1b[0m Reason: ${reason} | Input: "${userInput}"`,
    );
  }
}
