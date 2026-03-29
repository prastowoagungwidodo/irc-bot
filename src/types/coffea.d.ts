declare module 'coffea' {
  interface CoffeaMessage {
    type: string;
    channel: string;
    nick: string;
    text: string;
  }

  interface CoffeaNetworks {
    on(event: 'message', handler: (msg: CoffeaMessage) => void): void;
    on(event: 'error', handler: (err: Error) => void): void;
    on(event: string, handler: (...args: any[]) => void): void;
    send(msg: { type: string; channel: string; text: string }): void;
  }

  interface CoffeaConfig {
    protocol: string;
    network: string;
    channels: string[];
    nick: string;
    [key: string]: any;
  }

  export function connect(configs: CoffeaConfig[]): CoffeaNetworks;
}

declare module 'coffea-irc' {
  const plugin: any;
  export default plugin;
}
