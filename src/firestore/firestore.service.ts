import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Firestore } from '@google-cloud/firestore';
import * as fs from 'fs';

export interface UserProfile {
  user_id: string;
  name: string;
  occupation?: string;
  current_status: 'Active' | 'Inactive' | 'In_Routine' | 'Onboarding';
  onboarding_step?: 'FITNESS_LEVEL' | 'WEEKLY_FREQUENCY' | 'BIOMETRICS' | 'RESTRICTIONS' | 'COMPLETED';
  profile: {
    fitness_level: 'beginner' | 'intermediate' | 'advanced';
    age: number;
    weight_kg: number;
    height_cm: number;
    bmi: number;
    max_hr_bpm: number;
    max_weekly_frequency: number;
    physical_restrictions?: string[];
  };
  schedule: {
    preferred_days: string[];
    next_workout: string; // ISO string
    weekly_streak: number;
    last_completed_workout?: string;
    load_adjustment_factor?: number;
  };
  created_at?: string;
}

@Injectable()
export class FirestoreService implements OnModuleInit {
  private firestore: Firestore | null = null;
  private readonly logger = new Logger(FirestoreService.name);
  private memoryStore: Map<string, any> = new Map();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initFirestore();
  }

  private initFirestore(): boolean {
    if (this.firestore) return true;

    const projectId = this.configService.get<string>('firestore.projectId') || 'quickburnai';
    const keyFilename = this.configService.get<string>('firestore.keyFilename');

    try {
      if (keyFilename && fs.existsSync(keyFilename)) {
        this.firestore = new Firestore({ projectId, keyFilename });
        this.logger.log(`Conectado a Firestore GCP con Service Account JSON (${keyFilename}) (Project: ${projectId})`);
        return true;
      } else {
        this.firestore = new Firestore({ projectId });
        this.logger.log(`Conectado a Firestore GCP vía ADC nativo Cloud Run (Project: ${projectId})`);
        return true;
      }
    } catch (error) {
      this.logger.warn(`Error inicializando cliente Firestore: ${error.message}`);
    }

    this.logger.warn('Usando almacén en memoria para desarrollo local.');
    return false;
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    this.initFirestore();

    if (this.firestore) {
      try {
        const doc = await this.firestore.collection('users').doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as any;
          const age = data.profile?.age ?? 0;
          const weight = data.profile?.weight_kg ?? 0;
          const height = data.profile?.height_cm ?? 0;
          const heightM = height > 0 ? height / 100 : 1.7;
          const bmi = weight > 0 && height > 0 ? parseFloat((weight / (heightM * heightM)).toFixed(1)) : 0;
          const max_hr_bpm = age > 0 ? 220 - age : 0;

          return {
            user_id: data.user_id || userId,
            name: data.name || 'Athlete',
            occupation: data.occupation || 'Desk Job / General',
            current_status: data.current_status || 'Active',
            onboarding_step: data.onboarding_step || 'COMPLETED',
            profile: {
              fitness_level: data.profile?.fitness_level || 'intermediate',
              age,
              weight_kg: weight,
              height_cm: height,
              bmi: data.profile?.bmi || bmi,
              max_hr_bpm: data.profile?.max_hr_bpm || max_hr_bpm,
              max_weekly_frequency: data.profile?.max_weekly_frequency || 3,
              physical_restrictions: data.profile?.physical_restrictions || [],
            },
            schedule: {
              preferred_days: data.schedule?.preferred_days || ['Monday', 'Wednesday', 'Friday'],
              next_workout: data.schedule?.next_workout || new Date().toISOString(),
              weekly_streak: data.schedule?.weekly_streak || 0,
              last_completed_workout: data.schedule?.last_completed_workout,
              load_adjustment_factor: data.schedule?.load_adjustment_factor || 1.0,
            },
            created_at: data.created_at || new Date().toISOString(),
          };
        }
      } catch (err) {
        this.logger.warn(`Error al consultar perfil en Firestore (UserId: ${userId}): ${err.message}`);
      }
    }

    return this.memoryStore.get(`user_${userId}`) || null;
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.initFirestore();
    this.memoryStore.set(`user_${profile.user_id}`, profile);

    if (this.firestore) {
      try {
        await this.firestore.collection('users').doc(profile.user_id).set(profile, { merge: true });
        this.logger.log(`Perfil de usuario ${profile.user_id} guardado exitosamente en Firestore.`);
      } catch (err) {
        this.logger.warn(`Error guardando perfil en Firestore (UserId: ${profile.user_id}): ${err.message}`);
      }
    }
  }

  async getSessionHistory(userId: string): Promise<any[]> {
    this.initFirestore();

    if (this.firestore) {
      try {
        const doc = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('sessions')
          .doc('active')
          .get();

        if (doc.exists) {
          return doc.data()?.messages || [];
        }
      } catch (err) {
        this.logger.warn(`Error al consultar historial de sesión en Firestore (${userId}): ${err.message}`);
      }
    }

    return this.memoryStore.get(`session_${userId}`) || [];
  }

  async saveSessionHistory(userId: string, messages: any[]): Promise<void> {
    this.initFirestore();
    this.memoryStore.set(`session_${userId}`, messages);

    if (this.firestore) {
      try {
        await this.firestore
          .collection('users')
          .doc(userId)
          .collection('sessions')
          .doc('active')
          .set({ messages, updated_at: new Date().toISOString() });
      } catch (err) {
        this.logger.warn(`Error al guardar sesión en Firestore (${userId}): ${err.message}`);
      }
    }
  }

  async clearSessionHistory(userId: string): Promise<void> {
    this.initFirestore();
    this.memoryStore.delete(`session_${userId}`);

    if (this.firestore) {
      try {
        await this.firestore
          .collection('users')
          .doc(userId)
          .collection('sessions')
          .doc('active')
          .delete();
      } catch (err) {
        this.logger.warn(`Error al limpiar sesión en Firestore (${userId}): ${err.message}`);
      }
    }
  }

  async saveRoutine(userId: string, routineData: any): Promise<string> {
    this.initFirestore();
    const routineId = `routine_${Date.now()}`;

    if (this.firestore) {
      try {
        await this.firestore
          .collection('users')
          .doc(userId)
          .collection('routines')
          .doc(routineId)
          .set({
            routine_id: routineId,
            user_id: userId,
            created_at: new Date().toISOString(),
            ...routineData,
          });
        this.logger.log(`Rutina ${routineId} guardada para usuario ${userId} en Firestore.`);
      } catch (err) {
        this.logger.warn(`Error guardando rutina en Firestore: ${err.message}`);
      }
    }

    return routineId;
  }

  async getWorkoutHistory(userId: string, limitCount = 5): Promise<any[]> {
    this.initFirestore();

    if (this.firestore) {
      try {
        const snapshot = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('workout_history')
          .orderBy('timestamp', 'desc')
          .limit(limitCount)
          .get();

        return snapshot.docs.map((doc) => doc.data());
      } catch (err) {
        this.logger.warn(`Error al consultar historial de entrenamientos en Firestore (${userId}): ${err.message}`);
      }
    }

    return this.memoryStore.get(`history_${userId}`) || [];
  }

  async logSessionCompletion(userId: string, durationMin: number, rpeScore: number): Promise<string> {
    return this.logWorkoutSession(userId, { duration_min: durationMin, rpe_score: rpeScore });
  }

  async logWorkoutSession(userId: string, sessionData: any): Promise<string> {
    this.initFirestore();
    const sessionId = `session_log_${Date.now()}`;

    if (this.firestore) {
      try {
        await this.firestore
          .collection('users')
          .doc(userId)
          .collection('workout_history')
          .doc(sessionId)
          .set({
            session_log_id: sessionId,
            user_id: userId,
            timestamp: new Date().toISOString(),
            ...sessionData,
          });
        this.logger.log(`Sesión de entrenamiento ${sessionId} registrada en Firestore para ${userId}.`);
      } catch (err) {
        this.logger.warn(`Error guardando sesión de entrenamiento en Firestore: ${err.message}`);
      }
    }

    const currentHistory = this.memoryStore.get(`history_${userId}`) || [];
    currentHistory.unshift({ session_log_id: sessionId, user_id: userId, timestamp: new Date().toISOString(), ...sessionData });
    this.memoryStore.set(`history_${userId}`, currentHistory);

    return sessionId;
  }
}
