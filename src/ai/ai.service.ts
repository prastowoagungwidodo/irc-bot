/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = 'https://models.inference.ai.azure.com';
  private readonly model: string;
  private readonly token: string;
  private readonly history = new Map<string, Message[]>();
  private readonly maxHistory: number;
  private readonly maxTokens: number;

  private readonly systemPrompt: Message;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.getOrThrow<string>('GITHUB_TOKEN');
    this.model = this.config.get<string>('AI_MODEL', 'gpt-4.1');
    this.maxTokens = parseInt(
      this.config.get<string>('AI_MAX_TOKENS', '200'),
      10,
    );
    this.maxHistory = parseInt(
      this.config.get<string>('AI_MAX_HISTORY', '100'),
      10,
    );
    this.systemPrompt = {
      role: 'system',
      content: this.config.get<string>(
        'AI_SYSTEM_PROMPT',
        'You are a helpful IRC bot. Keep responses concise.',
      ),
    };
  }

  private getHistory(channel: string): Message[] {
    if (!this.history.has(channel)) {
      this.history.set(channel, []);
    }
    return this.history.get(channel)!;
  }

  clearHistory(channel: string) {
    this.history.delete(channel);
  }

  async chat(channel: string, prompt: string): Promise<string> {
    try {
      const history = this.getHistory(channel);
      history.push({ role: 'user', content: prompt });

      // Trim if too long
      if (history.length > this.maxHistory) {
        history.splice(0, history.length - this.maxHistory);
      }
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          'Editor-Version': 'Neovim/0.11.6',
          'Editor-Plugin-Version': 'copilot/1.0.0',
          'Copilot-Integration-Id': 'vscode-chat',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [this.systemPrompt, ...history],
          max_tokens: this.maxTokens,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`GitHub Models API error: ${response.status} ${err}`);
        return 'Error communicating with AI.';
      }

      const data = await response.json();
      const reply =
        data?.choices?.[0]?.message?.content ?? 'No response from AI.';

      // Store assistant reply in history
      history.push({ role: 'assistant', content: reply });

      return reply;
    } catch (err) {
      this.logger.error('AI chat error', err);
      return 'Error communicating with AI.';
    }
  }
}
