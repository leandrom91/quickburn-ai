import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'child_process';
import * as fs from 'fs';

@Injectable()
export class VertexService implements OnModuleInit {
  private readonly logger = new Logger(VertexService.name);
  private projectId: string = 'quickburn-ai-dev';
  private location: string = 'us-central1';
  private defaultModelName: string = 'gemini-1.5-flash';
  private keyFilename?: string;
  private authClient: GoogleAuth | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.projectId = this.configService.get<string>('gcp.projectId') || 'quickburn-ai-dev';
    this.location = this.configService.get<string>('gcp.location') || 'us-central1';
    this.defaultModelName = this.configService.get<string>('gemini.modelName') || 'gemini-1.5-flash';
    this.keyFilename = this.configService.get<string>('firestore.keyFilename');

    if (this.keyFilename && fs.existsSync(this.keyFilename)) {
      try {
        this.authClient = new GoogleAuth({
          keyFile: this.keyFilename,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        this.logger.log(`🔑 Service Account JSON cargado exitosamente (${this.keyFilename})`);
      } catch (err) {
        this.logger.warn(`Error inicializando GoogleAuth con Service Account: ${err.message}`);
      }
    }

    this.logger.log(`🚀 VertexService Inicializado (Project: ${this.projectId}, Location: ${this.location})`);
  }

  private async getBearerToken(): Promise<string | null> {
    // 1. Obtener token del Service Account JSON (GoogleAuth)
    if (this.authClient) {
      try {
        const client = await this.authClient.getClient();
        const res = await client.getAccessToken();
        if (res && res.token) {
          return `Bearer ${res.token}`;
        }
      } catch (err) {
        this.logger.warn(`Error obteniendo token de Service Account: ${err.message}`);
      }
    }

    // 2. Fallback a gcloud Application Default Credentials (ADC local)
    try {
      const token = execSync('gcloud auth application-default print-access-token', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (token && token.length > 10) {
        return `Bearer ${token}`;
      }
    } catch (err) {
      // Token gcloud no disponible
    }

    return null;
  }

  async generateContent(prompt: string, overrideModel?: string): Promise<string> {
    const model = overrideModel || this.defaultModelName;
    const authHeader = await this.getBearerToken();

    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:generateContent`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    const data: any = await res.json();

    if (data && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }

    if (data && data.error) {
      throw new Error(`[Vertex AI ${data.error.code}]: ${data.error.message}`);
    }

    throw new Error('Respuesta vacía de Vertex AI');
  }
}
