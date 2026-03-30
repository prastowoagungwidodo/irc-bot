import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IrcService } from './irc/irc.service';
import { AiService } from './ai/ai.service';
import { BotCommand } from './bot/bot.command';
import { IrcProtectionService } from './irc/irc-protection.service';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  providers: [IrcService, IrcProtectionService, AiService, BotCommand],
})
export class AppModule {}
