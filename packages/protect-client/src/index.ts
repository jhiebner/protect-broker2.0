import type { DeviceProvider } from '@protect-broker/broker-core';
import type { ProtectConnectionInput } from '@protect-broker/shared';

export interface ProtectClient extends DeviceProvider {
  testConnection(settings: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }>;
}

export class StubProtectClient implements ProtectClient {
  readonly providerName = 'unifi-protect';

  async testConnection(_settings: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }> {
    return {
      ok: false,
      message: 'UniFi Protect integration will be implemented in Phase 2.',
    };
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
