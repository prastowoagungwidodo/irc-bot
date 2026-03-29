import { Command, CommandRunner } from 'nest-commander';
import { IrcService } from '../irc/irc.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';

@Command({ name: 'start', description: 'Start the IRC bot' })
export class BotCommand extends CommandRunner {
  private readonly nick: string;
  constructor(
    private readonly irc: IrcService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
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
}
