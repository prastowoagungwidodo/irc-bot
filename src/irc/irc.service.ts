import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'irc-framework';

@Injectable()
export class IrcService implements OnModuleInit {
  private readonly logger = new Logger(IrcService.name);
  private client!: Client;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Client();

    this.client.connect({
      host: 'irc.allnetwork.org',
      port: 6667,
      tls: false,
      nick: 'SiTi^Oke',
      username: 'siti',
      gecos: 'Tú eres mi corazón',
    });

    this.client.on('registered', () => {
      this.logger.log('Connected to IRC');
      // Identify with NickServ
      const nickPassword = this.config.get<string>('IRC_NICK_PASSWORD');
      if (nickPassword) {
        this.client.say('NickServ', `IDENTIFY ${nickPassword}`);
        this.logger.log('Sent NickServ IDENTIFY');
      }
      this.client.join('#purwokerto');
    });

    this.client.on('message', (event) => {
      this.logger.log(`[${event.target}] ${event.nick}: ${event.message}`);
    });

    this.client.on('error', (err) => {
      this.logger.error('IRC error', err);
    });
  }

  onMessage(
    handler: (event: { target: string; nick: string; message: string }) => void,
  ) {
    this.client.on('message', handler);
  }

  send(channel: string, text: string) {
    if (!channel || !text) return;
    const chunks = text.match(/.{1,400}/g) ?? [];
    for (const chunk of chunks) {
      this.client.say(channel, chunk);
    }
  }
}
