import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirestoreService } from '../firestore/firestore.service';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: string;
}

@Injectable()
export class AdkSessionService {
  private readonly logger = new Logger(AdkSessionService.name);
  private readonly MAX_SESSION_TURNS = 10; // Ventana deslizante óptima ADK: 5 pares conversacionales

  constructor(
    private readonly configService: ConfigService,
    private readonly firestoreService: FirestoreService,
  ) {}

  /**
   * Retorna la historia en ventana deslizante eficiente para el contexto del LLM
   */
  async getSessionHistory(sessionId: string, limitCount = this.MAX_SESSION_TURNS): Promise<ChatMessage[]> {
    const fullHistory = await this.firestoreService.getSessionHistory(sessionId);
    return fullHistory.slice(-limitCount);
  }

  /**
   * Agrega un mensaje manteniendo la memoria acotada y persistida en Firestore
   */
  async addMessage(sessionId: string, role: 'user' | 'model' | 'system', content: string): Promise<void> {
    const history = await this.firestoreService.getSessionHistory(sessionId);
    history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // Aplicar Ventana Deslizante ADK (Shift de mensajes antiguos)
    while (history.length > this.MAX_SESSION_TURNS) {
      history.shift();
    }

    await this.firestoreService.saveSessionHistory(sessionId, history);
  }

  /**
   * Reinicia la sesión activa en Firestore
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.firestoreService.clearSessionHistory(sessionId);
    this.logger.log(`Sesión agéntica ${sessionId} reiniciada en Firestore.`);
  }
}
