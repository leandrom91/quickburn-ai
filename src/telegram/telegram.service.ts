import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { OrchestratorAgent } from '../agents/orchestrator.agent';
import { PromptSafetyGuardrails } from '../guardrails/prompt-safety.guardrails';
import { AdkSessionService } from '../agents/adk-session.service';
import { FirestoreService, UserProfile } from '../firestore/firestore.service';
import { VertexService } from '../vertex/vertex.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestratorAgent: OrchestratorAgent,
    private readonly promptSafetyGuardrails: PromptSafetyGuardrails,
    private readonly adkSessionService: AdkSessionService,
    private readonly firestoreService: FirestoreService,
    private readonly vertexService: VertexService,
  ) {}

  onModuleInit() {
    const token = this.configService.get<string>('telegram.botToken');

    if (!token || token.trim() === '' || token === 'tu_telegram_bot_token_aqui') {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN no provisto o con valor por defecto. Modo inactivo hasta configurar token válido.',
      );
      return;
    }

    try {
      this.bot = new Telegraf(token);
      this.setupHandlers();

      const isWebhook = this.configService.get<string>('TELEGRAM_MODE') === 'webhook';
      if (!isWebhook) {
        this.bot.launch();
        this.logger.log('Bot de Telegram iniciado en modo Polling (Desarrollo Local).');
      } else {
        this.logger.log('Bot de Telegram listo en modo Webhook Serverless (Cloud Run).');
      }
    } catch (error) {
      this.logger.error(`Error al arrancar el Bot de Telegram: ${error.message}`);
    }
  }

  async handleWebhookUpdate(update: any) {
    if (this.bot) {
      await this.bot.handleUpdate(update);
    }
  }

  private async sendSafeMarkdownReply(ctx: any, text: string, extraOptions: any = {}) {
    try {
      await ctx.reply(text, { parse_mode: 'Markdown', ...extraOptions });
    } catch (err) {
      this.logger.warn(`Fallback a texto plano por sintaxis Markdown en Telegram: ${err.message}`);
      await ctx.reply(text, extraOptions);
    }
  }

  private setupHandlers() {
    // Comando /start y /reset (Inicio de Onboarding Conversacional)
    const resetHandler = async (ctx: any) => {
      const userId = String(ctx.from.id);
      const firstName = ctx.from.first_name || 'Athlete';

      await this.adkSessionService.clearSession(userId);
      this.logger.log(`Iniciando Onboarding agéntico para atleta ${userId} (${firstName}).`);

      const initialProfile: UserProfile = {
        user_id: userId,
        name: firstName,
        occupation: 'Desk Job / General',
        current_status: 'Onboarding',
        onboarding_step: 'FITNESS_LEVEL',
        profile: {
          fitness_level: 'intermediate',
          age: 0,
          weight_kg: 0,
          height_cm: 0,
          bmi: 0,
          max_hr_bpm: 0,
          max_weekly_frequency: 3,
          physical_restrictions: [],
        },
        schedule: {
          preferred_days: ['Monday', 'Wednesday', 'Friday'],
          next_workout: new Date().toISOString(),
          weekly_streak: 0,
        },
      };

      await this.firestoreService.saveUserProfile(initialProfile);
      await this.promptFitnessLevelStep(ctx, firstName);
    };

    this.bot.start(resetHandler);
    this.bot.command('reset', resetHandler);

    // PASO 1: Selección de Nivel de Condición Física
    this.bot.action(/OB_FITNESS_(beginner|intermediate|advanced)/, async (ctx: any) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const level = ctx.match[1] as 'beginner' | 'intermediate' | 'advanced';

      const profile = await this.firestoreService.getUserProfile(userId);
      if (profile) {
        profile.profile.fitness_level = level;
        profile.onboarding_step = 'WEEKLY_FREQUENCY';
        await this.firestoreService.saveUserProfile(profile);
      }

      await this.promptWeeklyFrequencyStep(ctx, level);
    });

    // PASO 2: Selección de Frecuencia Semanal
    this.bot.action(/OB_FREQ_(\d)/, async (ctx: any) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const freq = parseInt(ctx.match[1], 10);

      const profile = await this.firestoreService.getUserProfile(userId);
      if (profile) {
        profile.profile.max_weekly_frequency = freq;
        profile.onboarding_step = 'BIOMETRICS';
        await this.firestoreService.saveUserProfile(profile);
      }

      await this.promptBiometricsStep(ctx);
    });

    // PASO 4: Finalización por botón Inline de Restricciones
    this.bot.action('OB_RESTRICTIONS_NONE', async (ctx: any) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);

      const profile = await this.firestoreService.getUserProfile(userId);
      if (profile) {
        profile.profile.physical_restrictions = [];
        profile.current_status = 'Active';
        profile.onboarding_step = 'COMPLETED';
        await this.firestoreService.saveUserProfile(profile);
      }

      await this.finishOnboarding(ctx, profile);
    });

    // Manejo de Inline Keyboards (Comandos Rápidos)
    this.bot.action('CMD_WORKOUT', async (ctx) => {
      await ctx.answerCbQuery();
      if (!(await this.ensureOnboardingCompleted(ctx))) return;

      await ctx.sendChatAction('typing');
      const response = await this.orchestratorAgent.handleUserTurn(String(ctx.from.id), 'Quiero entrenar 15 minutos');
      await this.sendSafeMarkdownReply(ctx, response);
    });

    this.bot.action('CMD_SCHEDULE', async (ctx) => {
      await ctx.answerCbQuery();
      if (!(await this.ensureOnboardingCompleted(ctx))) return;

      await ctx.sendChatAction('typing');
      const response = await this.orchestratorAgent.handleUserTurn(String(ctx.from.id), 'No puedo entrenar hoy, reprograma para mañana');
      await this.sendSafeMarkdownReply(ctx, response);
    });

    this.bot.action('CMD_RPE', async (ctx) => {
      await ctx.answerCbQuery();
      if (!(await this.ensureOnboardingCompleted(ctx))) return;

      await ctx.sendChatAction('typing');
      const response = await this.orchestratorAgent.handleUserTurn(String(ctx.from.id), 'Terminé con RPE 8/10');
      await this.sendSafeMarkdownReply(ctx, response);
    });

    // Escucha de mensajes de texto libres (Onboarding + Turnos Agénticos)
    this.bot.on('text', async (ctx) => {
      const userId = String(ctx.from.id);
      const userInput = ctx.message.text;

      // Validación con Guardrails
      const guardrail = this.promptSafetyGuardrails.validateInput(userInput);
      if (!guardrail.passed) {
        await this.sendSafeMarkdownReply(ctx, `🚫 *Petición no permitida:* ${guardrail.reason}`);
        return;
      }

      // Verificar si el usuario tiene Onboarding Pendiente
      const profile = await this.firestoreService.getUserProfile(userId);
      if (!profile || profile.onboarding_step !== 'COMPLETED') {
        await this.handlePendingOnboarding(ctx, profile, userInput);
        return;
      }

      await ctx.sendChatAction('typing');
      const response = await this.orchestratorAgent.handleUserTurn(userId, userInput, ctx.from.first_name);
      await this.sendSafeMarkdownReply(ctx, response);
    });
  }

  /**
   * Extracción inteligente de biometría mediante Vertex AI LLM
   */
  private async parseBiometricsWithLlm(userInput: string, existing: { age: number; weight_kg: number; height_cm: number }) {
    const prompt = `
Analiza el mensaje en lenguaje natural del atleta y extrae la edad (en años), peso (en kg) y altura (en cm).

MENSAJE DEL ATLETA: "${userInput}"
VALORES ACTUALES REGISTRADOS: Edad=${existing.age}, Peso=${existing.weight_kg}kg, Altura=${existing.height_cm}cm

REGLAS DE EXTRACCIÓN:
1. Si el atleta dice un número como "175", "1.75", "metro 75", "175cm", interpreta que es su altura en cm (175).
2. Si el atleta dice "pesaba 98", "98 kilos", "98kg", "pesando 98", interpreta que es su peso en kg (98).
3. Si el atleta dice "tengo 34", "34 años", "34 yo", interpreta que es su edad en años (34).
4. Mantén el valor registrado previamente si no se menciona un dato nuevo en el mensaje actual.

Responde ÚNICAMENTE en JSON con esta estructura exacta (sin texto adicional):
{"age": number, "weight_kg": number, "height_cm": number}
`;

    try {
      const rawResponse = await this.vertexService.generateContent(prompt, 'gemini-2.5-flash');
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        let h = Number(parsed.height_cm) || existing.height_cm || 0;
        if (h > 0 && h < 3) h = Math.round(h * 100);

        return {
          age: Number(parsed.age) || existing.age || 0,
          weight_kg: Number(parsed.weight_kg) || existing.weight_kg || 0,
          height_cm: h,
        };
      }
    } catch (err) {
      this.logger.warn(`Error en parsing de biometría con LLM: ${err.message}`);
    }

    // Fallback a regex si falla la llamada
    const parsedAge = userInput.match(/(\d+)\s*(años|año|yo|y\/o)/i) || userInput.match(/tengo\s*(\d+)/i) || userInput.match(/^(\d{2})$/);
    const parsedWeight = userInput.match(/(\d+[\.,]?\d*)\s*(kg|kilos|kilogramos)/i) || userInput.match(/pesaba\s*(\d+[\.,]?\d*)/i) || userInput.match(/peso\s*:?\s*(\d+)/i);
    const parsedHeight = userInput.match(/(\d{3})\s*(cm|centimetros|cm\.)/i) || userInput.match(/mido\s*(\d+[\.,]?\d*)/i) || userInput.match(/^(\d{3})$/);

    let age = existing.age || 0;
    let weight = existing.weight_kg || 0;
    let height = existing.height_cm || 0;

    if (parsedAge) age = parseInt(parsedAge[1], 10);
    if (parsedWeight) weight = parseFloat(parsedWeight[1].replace(',', '.'));
    if (parsedHeight) {
      const hVal = parseFloat(parsedHeight[1].replace(',', '.'));
      height = hVal < 3 ? Math.round(hVal * 100) : Math.round(hVal);
    }

    return { age, weight_kg: weight, height_cm: height };
  }

  /**
   * Intercepta y guía al usuario cuando intenta conversar teniendo un onboarding pendiente
   */
  private async handlePendingOnboarding(ctx: any, profile: UserProfile | null, userInput: string) {
    const firstName = ctx.from.first_name || 'Athlete';
    const step = profile?.onboarding_step || 'FITNESS_LEVEL';

    // Manejar ingreso incremental de Biometría (Edad, Peso, Altura) con LLM
    if (step === 'BIOMETRICS' && profile && userInput) {
      await ctx.sendChatAction('typing');

      const existingBio = {
        age: profile.profile.age || 0,
        weight_kg: profile.profile.weight_kg || 0,
        height_cm: profile.profile.height_cm || 0,
      };

      const extracted = await this.parseBiometricsWithLlm(userInput, existingBio);

      profile.profile.age = extracted.age;
      profile.profile.weight_kg = extracted.weight_kg;
      profile.profile.height_cm = extracted.height_cm;

      await this.firestoreService.saveUserProfile(profile);

      // Si falta alguno de los 3 datos, solicitar amablemente el dato faltante
      const missing: string[] = [];
      if (!extracted.age) missing.push('edad (años)');
      if (!extracted.weight_kg) missing.push('peso (kg)');
      if (!extracted.height_cm) missing.push('altura (cm)');

      if (missing.length > 0) {
        const savedText = [
          extracted.age ? `${extracted.age} años` : null,
          extracted.weight_kg ? `${extracted.weight_kg} kg` : null,
          extracted.height_cm ? `${extracted.height_cm} cm` : null,
        ].filter(Boolean).join(' | ');

        await this.sendSafeMarkdownReply(
          ctx,
          `👍 *Registrado hasta ahora:* ${savedText || 'En proceso...'}\n\n` +
          `¡Ya casi lo tenemos, *${firstName}*! Para calcular tu Frecuencia Cardíaca Máxima e IMC exacto, solo me falta saber tu *${missing.join(' y ')}*.\n\n` +
          `¿Podrías indicármelo en un mensaje? (ej: *"mido 175 cm"* o *"98 kg"* o *"175"*)`
        );
        return;
      }

      // Si tenemos los 3 datos completos, calcular métricas y avanzar al Paso 4
      const heightM = extracted.height_cm / 100;
      const bmi = parseFloat((extracted.weight_kg / (heightM * heightM)).toFixed(1));
      const maxHr = 220 - extracted.age;

      profile.profile.bmi = bmi;
      profile.profile.max_hr_bpm = maxHr;
      profile.onboarding_step = 'RESTRICTIONS';

      await this.firestoreService.saveUserProfile(profile);

      await this.sendSafeMarkdownReply(
        ctx,
        `✅ *Biometría completa registrada:* ${extracted.age} años | ${extracted.weight_kg} kg | ${extracted.height_cm} cm\n` +
        `📊 *IMC:* ${bmi} | *Frecuencia Cardíaca Máx:* ${maxHr} bpm\n\n`
      );

      await this.promptRestrictionsStep(ctx, profile.profile.max_weekly_frequency || 3);
      return;
    }

    if (step === 'RESTRICTIONS' && profile && userInput) {
      profile.profile.physical_restrictions = [userInput];
      profile.current_status = 'Active';
      profile.onboarding_step = 'COMPLETED';
      await this.firestoreService.saveUserProfile(profile);
      await this.finishOnboarding(ctx, profile);
      return;
    }

    const reminderHeader =
      `¡Me encanta tu entusiasmo por entrenar, *${firstName}*! 🚀💪\n\n` +
      `Sin embargo, aún no podemos avanzar a la rutina. Para cuidar tu salud deportiva y adaptar cada sesión a tu nivel exacto, necesitamos completar primero tu configuración inicial.\n\n` +
      `¡Falta muy poco! Por favor responde:`;

    if (step === 'FITNESS_LEVEL') {
      await this.promptFitnessLevelStep(ctx, firstName);
    } else if (step === 'WEEKLY_FREQUENCY') {
      await this.promptWeeklyFrequencyStep(ctx, profile?.profile.fitness_level || 'intermediate');
    } else if (step === 'BIOMETRICS') {
      await this.promptBiometricsStep(ctx);
    } else {
      await this.promptRestrictionsStep(ctx, profile?.profile.max_weekly_frequency || 3);
    }
  }

  private async ensureOnboardingCompleted(ctx: any): Promise<boolean> {
    const userId = String(ctx.from.id);
    const profile = await this.firestoreService.getUserProfile(userId);
    if (!profile || profile.onboarding_step !== 'COMPLETED') {
      await this.handlePendingOnboarding(ctx, profile, '');
      return false;
    }
    return true;
  }

  private async promptFitnessLevelStep(ctx: any, firstName: string) {
    const text =
      `🔥 *¡BIENVENIDO A QUICKBURN AI, ${firstName.toUpperCase()}!* 🔥\n\n` +
      `Soy tu Coach Deportivo Inteligente de HIIT. Antes de comenzar, configuremos tu perfil en *4 preguntas rápidas*.\n\n` +
      `*Pregunta 1 de 4:* ¿Cuál es tu nivel de condición física actual?`;

    await this.sendSafeMarkdownReply(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Principiante (Sin experiencia previa)', 'OB_FITNESS_beginner')],
      [Markup.button.callback('🟡 Intermedio (Entreno ocasionalmente)', 'OB_FITNESS_intermediate')],
      [Markup.button.callback('🔴 Avanzado (Atleta constante)', 'OB_FITNESS_advanced')],
    ]));
  }

  private async promptWeeklyFrequencyStep(ctx: any, level: string) {
    const text =
      `✅ *Nivel guardado:* ${level.toUpperCase()}\n\n` +
      `*Pregunta 2 de 4:* ¿Cuántos días a la semana te gustaría entrenar HIIT?`;

    await this.sendSafeMarkdownReply(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('⚡ 2 Días a la semana', 'OB_FREQ_2')],
      [Markup.button.callback('🔥 3 Días a la semana', 'OB_FREQ_3')],
      [Markup.button.callback('💥 4 Días a la semana', 'OB_FREQ_4')],
    ]));
  }

  private async promptBiometricsStep(ctx: any) {
    const text =
      `📋 *Pregunta 3 de 4: Datos Biométricos & Fisiológicos*\n\n` +
      `Para calcular tu Frecuencia Cardíaca Máxima y gasto calórico exacto (METs), ¿podrías indicarme tu *edad*, *peso (kg)* y *altura (cm)*?\n\n` +
      `*Por ejemplo:* _"28 años, 75kg, 178cm"_`;

    await this.sendSafeMarkdownReply(ctx, text);
  }

  private async promptRestrictionsStep(ctx: any, freq: number) {
    const text =
      `📋 *Pregunta 4 de 4:* ¿Tienes alguna lesión o restricción física activa? (ej: molestia en rodilla o espalda)\n\n` +
      `Puedes escribírmela directamente en un mensaje o pulsar el botón si estás 100% sano:`;

    await this.sendSafeMarkdownReply(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('✅ Sin Restricciones / 100% Sano', 'OB_RESTRICTIONS_NONE')],
    ]));
  }

  private async finishOnboarding(ctx: any, profile: UserProfile | null) {
    const text =
      `🎉 *¡PERFIL DE ATLETA CONFIGURADO CON ÉXITO!* 🎉\n\n` +
      `• *Atleta:* ${profile?.name}\n` +
      `• *Nivel:* ${profile?.profile.fitness_level.toUpperCase()}\n` +
      `• *Frecuencia:* ${profile?.profile.max_weekly_frequency} Días/Semana\n` +
      `• *Biometría:* ${profile?.profile.age} años | ${profile?.profile.weight_kg} kg | ${profile?.profile.height_cm} cm (IMC: ${profile?.profile.bmi})\n` +
      `• *Frecuencia Cardíaca Máx:* ${profile?.profile.max_hr_bpm} bpm\n` +
      `• *Restricciones:* ${profile?.profile.physical_restrictions?.length ? profile.profile.physical_restrictions.join(', ') : 'Ninguna'}\n\n` +
      `Tu perfil ha sido guardado de forma permanente en Firestore. ¡Estoy listo para acompañarte a cumplir tus metas!\n\n` +
      `¿Qué deseas hacer hoy? Usa los botones o escríbeme libremente:`;

    await this.sendSafeMarkdownReply(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('🏋️ Generar Rutina HIIT', 'CMD_WORKOUT')],
      [Markup.button.callback('📅 Reprogramar Entrenamiento', 'CMD_SCHEDULE')],
      [Markup.button.callback('📊 Reportar Esfuerzo RPE', 'CMD_RPE')],
    ]));
  }

  async sendProactiveNotification(userId: string, message: string) {
    if (this.bot) {
      try {
        await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      } catch (err) {
        this.logger.error(`Error enviando notificación proactiva a ${userId}: ${err.message}`);
      }
    }
  }
}
