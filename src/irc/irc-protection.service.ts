import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface FloodEntry {
  timestamps: number[];
}

@Injectable()
export class IrcProtectionService {
  private readonly logger = new Logger(IrcProtectionService.name);

  private readonly badWords: string[];
  private readonly messageFloodMap = new Map<string, FloodEntry>();
  private readonly joinFloodMap = new Map<string, FloodEntry>();

  // Message flood: max messages per window (ms)
  private readonly msgFloodMax: number;
  private readonly msgFloodWindow: number;

  // Join flood: max joins per window (ms)
  private readonly joinFloodMax: number;
  private readonly joinFloodWindow: number;

  // Channels currently locked due to join flood
  private readonly lockedChannels = new Set<string>();

  constructor(private readonly config: ConfigService) {
    this.badWords = (this.config.get<string>('IRC_BADWORDS', '') || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);

    this.msgFloodMax = this.config.get<number>('IRC_MSG_FLOOD_MAX', 5);
    this.msgFloodWindow = this.config.get<number>(
      'IRC_MSG_FLOOD_WINDOW_MS',
      10000,
    );
    this.joinFloodMax = this.config.get<number>('IRC_JOIN_FLOOD_MAX', 5);
    this.joinFloodWindow = this.config.get<number>(
      'IRC_JOIN_FLOOD_WINDOW_MS',
      15000,
    );
  }

  /**
   * Returns the matched bad word if the message contains one, otherwise null.
   */
  checkBadWords(message: string): string | null {
    const lower = message.toLowerCase();
    for (const word of this.badWords) {
      if (lower.includes(word)) {
        return word;
      }
    }
    return null;
  }

  /**
   * Returns true if the user is flooding the channel with messages.
   */
  checkMessageFlood(channel: string, nick: string): boolean {
    const key = `${channel}:${nick}`;
    return this.isFlooding(
      this.messageFloodMap,
      key,
      this.msgFloodMax,
      this.msgFloodWindow,
    );
  }

  /**
   * Returns true if the channel is experiencing a join flood.
   */
  checkJoinFlood(channel: string): boolean {
    return this.isFlooding(
      this.joinFloodMap,
      channel,
      this.joinFloodMax,
      this.joinFloodWindow,
    );
  }

  isChannelLocked(channel: string): boolean {
    return this.lockedChannels.has(channel);
  }

  lockChannel(channel: string, durationMs = 60000) {
    this.lockedChannels.add(channel);
    this.logger.warn(
      `Channel ${channel} locked for ${durationMs / 1000}s due to join flood`,
    );
    setTimeout(() => {
      this.lockedChannels.delete(channel);
      this.logger.log(`Channel ${channel} lock expired`);
    }, durationMs);
  }

  private isFlooding(
    map: Map<string, FloodEntry>,
    key: string,
    max: number,
    windowMs: number,
  ): boolean {
    const now = Date.now();
    let entry = map.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      map.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    entry.timestamps.push(now);
    return entry.timestamps.length > max;
  }
}
