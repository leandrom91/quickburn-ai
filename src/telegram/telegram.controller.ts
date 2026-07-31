import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: any) {
    await this.telegramService.handleWebhookUpdate(update);
    return { ok: true };
  }

  @Post('trigger-proactive')
  async triggerProactiveNotification(@Body() body: { userId: string; message: string }) {
    await this.telegramService.sendProactiveNotification(body.userId, body.message);
    return { status: 'Notificación enviada', userId: body.userId };
  }
}
