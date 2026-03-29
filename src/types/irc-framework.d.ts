declare module 'irc-framework' {
  import { EventEmitter } from 'events';

  interface ConnectOptions {
    host: string;
    port?: number;
    tls?: boolean;
    nick: string;
    username?: string;
    gecos?: string;
    password?: string;
  }

  interface MessageEvent {
    target: string;
    nick: string;
    message: string;
    type: string;
    tags: Record<string, string>;
  }

  class Client extends EventEmitter {
    connect(options: ConnectOptions): void;
    join(channel: string): void;
    part(channel: string, message?: string): void;
    say(target: string, message: string): void;
    notice(target: string, message: string): void;
    quit(message?: string): void;
    whois(nick: string): void;
    raw(command: string): void;
    on(event: 'registered', listener: () => void): this;
    on(event: 'message', listener: (event: MessageEvent) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export { Client, ConnectOptions, MessageEvent };
}
