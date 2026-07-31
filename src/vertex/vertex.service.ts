import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI } from '@google-cloud/vertexai';
import * as fs from 'fs';

@Injectable()
export class VertexService implements OnModuleInit {
  private readonly logger = new Logger(VertexService.name);
  private vertexAi: VertexAI | null = null;
  private projectId: string = 'quickburnai';
  private location: string = 'us-central1';
  private defaultModelName: string = 'gemini-2.5-flash';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.projectId = this.configService.get<string>('gcp.projectId') || 'quickburnai';
    this.location = this.configService.get<string>('gcp.location') || 'us-central1';
    this.defaultModelName = this.configService.get<string>('gemini.modelName') || 'gemini-2.5-flash';
    const keyFilename = this.configService.get<string>('firestore.keyFilename');

    try {
      const options: any = {
        project: this.projectId,
        location: this.location,
      };

      if (keyFilename && fs.existsSync(keyFilename)) {
        options.googleAuthOptions = { keyFile: keyFilename };
        this.logger.log(`🔑 VertexAI SDK usando Service Account JSON (${keyFilename})`);
      } else {
        this.logger.log(`🔑 VertexAI SDK usando credenciales ADC nativas de Cloud Run`);
      }

      this.vertexAi = new VertexAI(options);
      this.logger.log(`🚀 VertexService Inicializado con SDK Oficial @google-cloud/vertexai (Project: ${this.projectId}, Location: ${this.location})`);
    } catch (err) {
      this.logger.error(`Error inicializando SDK de VertexAI: ${err.message}`);
    }
  }

  async generateContent(prompt: string, overrideModel?: string): Promise<string> {
    if (!this.vertexAi) {
      throw new Error('SDK de VertexAI no inicializado.');
    }

    const modelName = overrideModel || this.defaultModelName;

    try {
      const generativeModel = this.vertexAi.getGenerativeModel({
        model: modelName,
      });

      const resp = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const candidates = resp.response.candidates;
      if (candidates && candidates[0]?.content?.parts?.[0]?.text) {
        return candidates[0].content.parts[0].text.trim();
      }

      throw new Error('Respuesta vacía recibida del SDK de Vertex AI');
    } catch (err) {
      this.logger.warn(`Error en generación con SDK Vertex AI (${modelName}): ${err.message}`);
      throw err;
    }
  }
}
