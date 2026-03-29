import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IrcService } from './irc/irc.service';
import { AiService } from './ai/ai.service';
import { BotCommand } from './bot/bot.command';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [IrcService, AiService, BotCommand],
})
export class AppModule {}
