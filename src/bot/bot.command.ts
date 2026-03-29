/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
import { Command, CommandRunner } from 'nest-commander';
import { IrcService } from '../irc/irc.service';
import { AiService } from '../ai/ai.service';

@Command({ name: 'start', description: 'Start the IRC bot' })
export class BotCommand extends CommandRunner {
  constructor(
    private readonly irc: IrcService,
    private readonly ai: AiService,
  ) {
    super();
  }

  async run() {
    this.irc.onMessage(async (event) => {
      const msg = event.message;

      if (msg === 'SiTi^Oke reset') {
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
      if (!msg.startsWith('SiTi^Oke ')) return;

      const prompt = msg.slice(9).trim();
      if (!prompt) {
        this.irc.send(event.target, '???');
        return;
      }

      const reply = await this.ai.chat(event.target, prompt);
      // Split long replies into 400-char chunks for IRC
      const chunks = reply.match(/.{1,400}/g) ?? [];
      for (const chunk of chunks) {
        this.irc.send(event.target, chunk);
      }
    });
  }
}
