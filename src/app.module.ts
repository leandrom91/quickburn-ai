import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envConfig } from './config/env.config';
import { FirestoreModule } from './firestore/firestore.module';
import { VertexModule } from './vertex/vertex.module';
import { AgentsModule } from './agents/agents.module';
import { TelegramModule } from './telegram/telegram.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    VertexModule,
    FirestoreModule,
    AgentsModule,
    TelegramModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
