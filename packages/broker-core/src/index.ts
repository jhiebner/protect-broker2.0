import { EventEmitter } from 'node:events';

export type BrokerEventMap = {
  'bootstrap.updated': {
    setupComplete: boolean;
    at: string;
  };
  'audit.logged': {
    userId?: string;
    action: string;
    at: string;
  };
  'system.health': {
    status: 'healthy' | 'degraded';
    at: string;
  };
  'protect.connection': {
    status: 'pending' | 'connected' | 'disconnected' | 'error';
    at: string;
    detail?: string;
  };
};

type EventKey<T> = Extract<keyof T, string>;
type EventHandler<T, K extends EventKey<T>> = (payload: T[K]) => void;

export class EventBus<T extends Record<string, unknown> = BrokerEventMap> {
  private readonly emitter = new EventEmitter();

  emit<K extends EventKey<T>>(event: K, payload: T[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends EventKey<T>>(event: K, handler: EventHandler<T, K>): () => void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(event, handler as (...args: unknown[]) => void);
    };
  }
}

export interface DeviceProvider {
  readonly providerName: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
