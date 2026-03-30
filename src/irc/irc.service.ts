import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'irc-framework';
import { IrcProtectionService } from './irc-protection.service';
import { DatabaseService, UserEventType } from '../database/database.service';

interface IrcMessageEvent {
  target: string;
  nick: string;
  message: string;
}

interface IrcJoinEvent {
  channel: string;
  nick: string;
}

interface IrcPartEvent {
  channel: string;
  nick: string;
  message?: string;
}

interface IrcQuitEvent {
  nick: string;
  message?: string;
}

export interface IrcUser {
  nick: string;
  ident: string;
  hostname: string;
  modes: string[];
  tags: Record<string, unknown>;
}

export interface IrcUserListEvent {
  channel: string;
  users: IrcUser[];
  tags: Record<string, unknown>;
}

@Injectable()
export class IrcService implements OnModuleInit {
  private readonly logger = new Logger(IrcService.name);
  private client!: Client;
  private botNick!: string;
  private master!: string;
  private channelUsers: Map<string, Set<string>> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly protection: IrcProtectionService,
    private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    this.client = new Client();
    this.botNick = this.config.get<string>('IRC_NICK', 'SiTi^Oke');
    this.master = this.config.get<string>('IRC_ADMIN_NICK', 'Bayangan');

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

    this.client.on('userlist', (data: IrcUserListEvent) => {
      const users = new Set<string>();
      for (const user of data.users) {
        users.add(user.nick);
      }
      this.channelUsers.set(data.channel, users);
    });

    this.client.on('join', (raw: unknown) => {
      const event = raw as IrcJoinEvent;
      if (!this.channelUsers.has(event.channel)) {
        this.channelUsers.set(event.channel, new Set());
      }
      this.channelUsers.get(event.channel)!.add(event.nick);
      this.handleJoinFlood(event.channel, event.nick);
      void this.db.logUserEvent(event.channel, event.nick, UserEventType.JOIN);
    });

    this.client.on('part', (raw: unknown) => {
      const event = raw as IrcPartEvent;
      this.channelUsers.get(event.channel)?.delete(event.nick);
      void this.db.logUserEvent(
        event.channel,
        event.nick,
        UserEventType.PART,
        event.message,
      );
    });

    this.client.on('quit', (raw: unknown) => {
      const event = raw as IrcQuitEvent;
      for (const users of this.channelUsers.values()) {
        users.delete(event.nick);
      }
      void this.db.logUserEvent(
        '',
        event.nick,
        UserEventType.QUIT,
        event.message,
      );
    });

    this.client.on('nick', (event: { nick: string; new_nick: string }) => {
      // Update all channels
      for (const users of this.channelUsers.values()) {
        if (users.delete(event.nick)) {
          users.add(event.new_nick);
        }
      }
      // Log nick change to DB
      void this.db.logUserEvent(
        '', // channel unknown for global nick change
        event.nick,
        UserEventType.NICK,
        event.new_nick,
      );
    });

    this.client.on('message', (raw: unknown) => {
      const event = raw as IrcMessageEvent;
      this.logger.log(`[${event.target}] ${event.nick}: ${event.message}`);

      // Ignore all private message except from admin / master
      if (event.target === this.botNick && event.nick !== this.master) {
        return;
      }

      // Log to database (only channel messages)
      if (event.target.startsWith('#')) {
        void this.db.logMessage(event.target, event.nick, event.message);
      }

      // Skip own messages for further processing
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

    this.client.on('error', (err: unknown) => {
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

  isUserOnline(channel: string, nick: string): boolean {
    const users = this.channelUsers.get(channel);
    if (!users) return false;
    return users.has(nick);
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

    // Log the kick event
    void this.db.logUserEvent(channel, nick, UserEventType.KICK, reason);

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
