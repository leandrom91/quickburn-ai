import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 QuickBurn AI Server running on http://0.0.0.0:${port}`);
  logger.log(`🤖 Multi-agent Ecosystem Initialized (Supervisor Pattern with Google ADK / Gemini)`);
}

bootstrap();
