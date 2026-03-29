import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'irc-framework';
import { IrcProtectionService } from './irc-protection.service';

@Injectable()
export class IrcService implements OnModuleInit {
  private readonly logger = new Logger(IrcService.name);
  private client!: Client;
  private botNick!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly protection: IrcProtectionService,
  ) {}

  onModuleInit() {
    this.client = new Client();
    this.botNick = this.config.get<string>('IRC_NICK', 'SiTi^Oke');

    this.client.connect({
      host: this.config.get<string>('IRC_HOST', 'irc.allnetwork.org'),
      port: this.config.get<number>('IRC_PORT', 6667),
      tls: this.config.get<string>('IRC_TLS', 'false') === 'true',
      nick: this.config.get<string>('IRC_NICK', 'SiTi^Oke'),
      username: this.config.get<string>('IRC_USERNAME', 'siti'),
      gecos: this.config.get<string>('IRC_REALNAME', 'Tú eres mi corazón'),
    });

    this.client.on('registered', () => {
      this.logger.log('Connected to IRC');
      // Identify with NickServ
      const nickPassword = this.config.get<string>('IRC_NICK_PASSWORD');
      if (nickPassword) {
        this.client.say('NickServ', `IDENTIFY ${nickPassword}`);
        this.logger.log('Sent NickServ IDENTIFY');
      }
      this.client.join(this.config.get<string>('IRC_CHANNEL', '#purwokerto'));
    });

    this.client.on('join', (event) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      this.handleJoinFlood(event.channel, event.nick);
    });

    this.client.on('message', (event) => {
      this.logger.log(`[${event.target}] ${event.nick}: ${event.message}`);

      // Skip own messages
      if (event.nick === this.botNick) return;

      // Bad words check
      const badWord = this.protection.checkBadWords(event.message);
      if (badWord) {
        this.logger.warn(
          `Bad word "${badWord}" from ${event.nick} in ${event.target}`,
        );
        this.kickAndBan(event.target, event.nick, `Jaga mulutmu Nak!`);
        return;
      }

      // Message flood check
      if (this.protection.checkMessageFlood(event.target, event.nick)) {
        this.logger.warn(`Message flood from ${event.nick} in ${event.target}`);
        this.kickAndBan(
          event.target,
          event.nick,
          'Santai! Nggak perlu nyepam, Nak!',
        );
        return;
      }
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

  private handleJoinFlood(channel: string, nick: string) {
    if (nick === this.botNick) return;

    if (this.protection.checkJoinFlood(channel)) {
      if (!this.protection.isChannelLocked(channel)) {
        this.logger.warn(`Join flood detected in ${channel}, setting +i`);
        this.client.raw(`MODE ${channel} +i`);
        this.protection.lockChannel(channel, 60000);

        // Unlock after duration
        setTimeout(() => {
          this.client.raw(`MODE ${channel} -i`);
          this.logger.log(`Removed +i from ${channel}`);
        }, 60000);
      }
    }
  }

  private kickAndBan(channel: string, nick: string, reason: string) {
    this.client.raw(`MODE ${channel} +b ${nick}!*@*`);
    this.client.raw(`KICK ${channel} ${nick} :${reason}`);

    // Auto-unban after 5 minutes
    setTimeout(
      () => {
        this.client.raw(`MODE ${channel} -b ${nick}!*@*`);
        this.logger.log(`Removed ban on ${nick} in ${channel}`);
      },
      5 * 60 * 1000,
    );
  }
}
