import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexService } from '../vertex/vertex.service';

@Injectable()
export class LlmGeneratorService {
  private readonly logger = new Logger(LlmGeneratorService.name);
  private modelName: string = 'gemini-2.5-flash';

  constructor(
    private readonly configService: ConfigService,
    private readonly vertexService: VertexService,
  ) {
    this.modelName = this.configService.get<string>('gemini.modelName') || 'gemini-2.5-flash';
  }

  async generateNaturalResponse(
    systemContext: string,
    technicalData: any,
    userInput: string,
    fallbackText: string,
  ): Promise<string> {
    const prompt = `
${systemContext}

CONTEXTO Y DATOS TÉCNICOS OBTENIDOS DE HERRAMIENTAS AGÉNTICAS:
${JSON.stringify(technicalData, null, 2)}

MENSAJE DEL ATLETA:
"${userInput}"

INSTRUCCIONES DE RESPUESTA:
- NO SALUDAR REPETIDAMENTE: Si la conversación ya está en curso en el chat, NUNCA inicies tu respuesta diciendo "¡Hola!", "¡Hola [Nombre]!" o "¡Hola de nuevo!". Entra directo al tema.
- Responde como un entrenador personal de HIIT humano, amigable, entusiasta, conversacional y empático.
- Usa lenguaje natural, fluido, adaptado 100% al mensaje específico del atleta. Jamás uses plantillas rígidas ni suenes como un robot.
- Explica los datos técnicos (ejercicios, horarios o RPE) de forma conversacional y clara.
- Sé breve, directo y motivador (máximo 3-4 párrafos cortos).
- Usa emojis con moderación para darle energía al mensaje.
`;

    try {
      const response = await this.vertexService.generateContent(prompt, this.modelName);
      if (response && response.length > 0) {
        return response;
      }
    } catch (err) {
      this.logger.warn(`Inferencia Vertex AI falló en LlmGeneratorService: ${err.message}`);
    }

    return fallbackText;
  }
}
