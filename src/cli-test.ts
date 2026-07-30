import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OrchestratorAgent } from './agents/orchestrator.agent';
import * as readline from 'readline';

async function bootstrapCLI() {
  console.log('\n======================================================');
  console.log('  🔥 QUICKBURN AI - MODO PRUEBA DE CONSOLA (CLI) 🔥');
  console.log('======================================================\n');
  console.log('Probando ecosistema multiagente y Agentic Tools...\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const orchestrator = app.get(OrchestratorAgent);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const testUserId = 'usuario_demo_123';

  console.log('💡 Escribe un mensaje para interactuar con los agentes.');
  console.log('Ejemplos de prueba:');
  console.log(' 1. "Quiero entrenar 15 minutos hoy"');
  console.log(' 2. "No puedo entrenar hoy, reprograma para dentro de 4 horas" (Prueba de Regla RN-01)');
  console.log(' 3. "Terminé mi entrenamiento con RPE 9/10"');
  console.log(' (Escribe "salir" para terminar)\n');

  const askQuestion = () => {
    rl.question('\x1b[36mTú:\x1b[0m ', async (userInput) => {
      if (userInput.trim().toLowerCase() === 'salir') {
        rl.close();
        await app.close();
        process.exit(0);
      }

      try {
        const response = await orchestrator.handleUserTurn(testUserId, userInput);
        console.log(`\n\x1b[32mQuickBurn AI:\x1b[0m\n${response}\n`);
      } catch (err) {
        console.error('\x1b[31mError:\x1b[0m', err.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

bootstrapCLI();
