import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export enum UserEventType {
  JOIN = 'join',
  PART = 'part',
  QUIT = 'quit',
  KICK = 'kick',
  NICK = 'nick',
}

export interface ConversationLog {
  id: number;
  channel: string;
  nick: string;
  message: string;
  created_at: Date;
}

export interface UserEvent {
  id: number;
  channel: string;
  nick: string;
  event_type: UserEventType;
  reason: string | null;
  created_at: Date;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: this.config.get<string>('DB_USERNAME', 'postgres'),
      password: this.config.get<string>('DB_PASSWORD', 'postgres'),
      database: this.config.get<string>('DB_NAME', 'ircbot'),
      max: this.config.get<number>('DB_POOL_MAX', 10),
    });
  }

  async onModuleInit() {
    await this.createTables();
    this.logger.log('Database tables initialized');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }

  private async createTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_logs (
        id BIGSERIAL PRIMARY KEY,
        channel VARCHAR(200) NOT NULL,
        nick VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        tsv TSVECTOR GENERATED ALWAYS AS (
          setweight(to_tsvector('simple', nick), 'A') ||
          setweight(to_tsvector('simple', message), 'B')
        ) STORED,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- searchConversations: WHERE channel = $1 ... ORDER BY created_at DESC
      CREATE INDEX IF NOT EXISTS idx_convlog_channel_created
        ON conversation_logs (channel, created_at DESC);

      -- seenUser: WHERE nick = $1 ORDER BY created_at DESC LIMIT 1
      CREATE INDEX IF NOT EXISTS idx_convlog_nick_created
        ON conversation_logs (nick, created_at DESC);

      -- Full-text search via GIN on generated tsvector column
      CREATE INDEX IF NOT EXISTS idx_convlog_tsv
        ON conversation_logs USING GIN (tsv);

      CREATE TABLE IF NOT EXISTS user_events (
        id BIGSERIAL PRIMARY KEY,
        channel VARCHAR(200) NOT NULL,
        nick VARCHAR(200) NOT NULL,
        event_type VARCHAR(10) NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- seenUser: WHERE nick = $1 ORDER BY created_at DESC LIMIT 1
      CREATE INDEX IF NOT EXISTS idx_userevt_nick_created
        ON user_events (nick, created_at DESC);
    `);
  }

  async logMessage(
    channel: string,
    nick: string,
    message: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO conversation_logs (channel, nick, message) VALUES ($1, $2, $3)',
        [channel, nick, message],
      );
    } catch (err) {
      this.logger.error('Failed to log message', err);
    }
  }

  async logUserEvent(
    channel: string,
    nick: string,
    eventType: UserEventType,
    reason?: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO user_events (channel, nick, event_type, reason) VALUES ($1, $2, $3, $4)',
        [channel, nick, eventType, reason ?? null],
      );
    } catch (err) {
      this.logger.error('Failed to log user event', err);
    }
  }

  async searchConversations(
    channel: string,
    query: string,
    limit = 5,
  ): Promise<ConversationLog[]> {
    // Build a tsquery from the raw input: split words and join with &
    const tsquery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' & ');

    if (!tsquery) {
      return [];
    }

    const { rows } = await this.pool.query<ConversationLog>(
      `SELECT id, channel, nick, message, created_at,
              ts_rank(tsv, to_tsquery('simple', $2)) AS rank
       FROM conversation_logs
       WHERE channel = $1 AND tsv @@ to_tsquery('simple', $2)
       ORDER BY rank DESC, created_at DESC
       LIMIT $3`,
      [channel, tsquery, limit],
    );
    return rows;
  }

  async seenUser(nick: string): Promise<{
    lastMessage: ConversationLog | null;
    lastEvent: UserEvent | null;
  }> {
    const { rows: msgRows } = await this.pool.query<ConversationLog>(
      `SELECT id, channel, nick, message, created_at
       FROM conversation_logs
       WHERE nick = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [nick],
    );

    const { rows: evtRows } = await this.pool.query<UserEvent>(
      `SELECT id, channel, nick, event_type, reason, created_at
       FROM user_events
       WHERE nick = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [nick],
    );

    return {
      lastMessage: msgRows[0] ?? null,
      lastEvent: evtRows[0] ?? null,
    };
  }
}
