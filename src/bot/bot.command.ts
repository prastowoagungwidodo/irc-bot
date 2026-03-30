import { Command, CommandRunner } from 'nest-commander';
import { IrcService } from '../irc/irc.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

@Command({ name: 'start', description: 'Start the IRC bot' })
export class BotCommand extends CommandRunner {
  private readonly nick: string;
  constructor(
    private readonly irc: IrcService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super();
    this.nick = this.config.get<string>('IRC_NICK', 'SiTi^Oke');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async run() {
    this.irc.onMessage((event) => {
      const msg = event.message;

      if (msg === this.nick + ' reset') {
        if (event.nick === 'Bayangan') {
          this.ai.clearHistory(event.target);
          this.irc.send(
            event.target,
            'Okeee, aku lupa semuanya~ mulai dari awal ya!',
          );
        } else {
          this.irc.send(
            event.target,
            'Maaf, cuma kak Bayangan yang bisa reset aku~',
          );
        }
        return;
      }

      // !search <query>
      if (msg.startsWith('!search ')) {
        const query = msg.slice(8).trim();
        if (!query) {
          this.irc.send(
            event.target,
            'Kasih kata kuncinya dong~ contoh: !search hello',
          );
          return;
        }
        void this.handleSearch(event.target, query);
        return;
      }

      // !seen <nick>
      if (msg.startsWith('!seen ')) {
        const targetNick = msg.slice(6).trim();
        if (!targetNick) {
          this.irc.send(
            event.target,
            'Siapa yang mau dicari? contoh: !seen Bayangan',
          );
          return;
        }
        void this.handleSeen(event.target, targetNick);
        return;
      }

      // Respond to messages prefixed with bot Nick (e.g., "SiTi^Oke ")
      if (!msg.startsWith(this.nick)) return;

      const prompt = msg.slice(this.nick.length).trim();
      if (!prompt) {
        this.irc.send(event.target, '???');
        return;
      }

      void this.ai.chat(event.target, prompt).then((reply) => {
        const chunks = reply.match(/.{1,400}/g) ?? [];
        for (const chunk of chunks) {
          this.irc.send(event.target, chunk);
        }
      });
    });
  }

  private async handleSearch(channel: string, query: string): Promise<void> {
    try {
      const results = await this.db.searchConversations(channel, query, 5);
      if (results.length === 0) {
        this.irc.send(
          channel,
          `Nggak ketemu percakapan dengan kata "${query}"`,
        );
        return;
      }
      this.irc.send(
        channel,
        `Hasil pencarian "${query}" (${results.length} terakhir):`,
      );
      for (const log of results) {
        const time = log.created_at
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);
        this.irc.send(channel, `[${time}] ${log.nick}: ${log.message}`);
      }
    } catch {
      this.irc.send(channel, 'Gagal mencari, coba lagi nanti ya~');
    }
  }

  private async handleSeen(channel: string, nick: string): Promise<void> {
    try {
      const seen = await this.db.seenUser(nick);
      if (!seen.lastMessage && !seen.lastEvent) {
        this.irc.send(channel, `Aku belum pernah lihat ${nick} deh~`);
        return;
      }

      if (seen.lastEvent) {
        const time = seen.lastEvent.created_at
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);
        const where = seen.lastEvent.channel || 'unknown';
        const reason = seen.lastEvent.reason
          ? ` (${seen.lastEvent.reason})`
          : '';
        this.irc.send(
          channel,
          `${nick} terakhir ${seen.lastEvent.event_type} di ${where} pada ${time}${reason}`,
        );
      }

      if (seen.lastMessage) {
        const time = seen.lastMessage.created_at
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);
        this.irc.send(
          channel,
          `Pesan terakhir ${nick} di ${seen.lastMessage.channel} [${time}]: ${seen.lastMessage.message}`,
        );
      }
    } catch {
      this.irc.send(channel, 'Gagal cek seen, coba lagi nanti ya~');
    }
  }
}
