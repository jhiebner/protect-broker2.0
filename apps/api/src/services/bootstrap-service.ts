import bcrypt from 'bcrypt';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { EventBus } from '@protect-broker/broker-core';
import type { ProtectClient } from '@protect-broker/protect-client';
import {
  type DeviceKind,
  bootstrapStateSchema,
  dashboardPreferencesSchema,
  farmProfileSchema,
  loginRequestSchema,
  protectConnectionSchema,
  setupAdminSchema,
  type BootstrapState,
  type DashboardPreferencesInput,
  type FarmProfileInput,
  type LoginRequest,
  type ProtectConnectionInput,
  type SetupAdminInput,
} from '@protect-broker/shared';

import { decryptString, encryptString } from '../lib/crypto.js';

const SETTING_KEYS = {
  systemSetup: 'system.setup',
  protect: 'protect.connection',
  farm: 'farm.profile',
  dashboard: 'dashboard.preferences',
} as const;

interface BootstrapServiceDependencies {
  prisma: PrismaClient;
  protectClient: ProtectClient;
  eventBus: EventBus;
  instanceSecret: Buffer;
}

interface StoredProtectConnection {
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  allowSelfSignedCertificate?: boolean;
}

export class BootstrapService {
  private lastProtectSyncAt = 0;
  private protectSyncInFlight: Promise<void> | null = null;

  constructor(private readonly deps: BootstrapServiceDependencies) {}

  async getBootstrapState(): Promise<BootstrapState> {
    const [administratorCreated, protectConfigured, farmConfigured, dashboardConfigured, setupSetting] =
      await Promise.all([
        this.deps.prisma.user.count().then((count) => count > 0),
        this.readSetting(SETTING_KEYS.protect),
        this.readSetting(SETTING_KEYS.farm),
        this.readSetting(SETTING_KEYS.dashboard),
        this.readSetting<{ setupComplete?: boolean }>(SETTING_KEYS.systemSetup),
      ]);

    return bootstrapStateSchema.parse({
      productName: 'Protect Broker',
      phase: 'phase-1',
      setupComplete: setupSetting?.setupComplete ?? false,
      administratorCreated,
      protectConfigured: protectConfigured !== null,
      farmConfigured: farmConfigured !== null,
      dashboardConfigured: dashboardConfigured !== null,
    });
  }

  async createAdministrator(input: SetupAdminInput): Promise<void> {
    const payload = setupAdminSchema.parse(input);
    const existingUsers = await this.deps.prisma.user.count();

    if (existingUsers > 0) {
      throw new Error('Administrator already configured.');
    }

    await this.deps.prisma.user.create({
      data: {
        username: payload.username,
        passwordHash: await bcrypt.hash(payload.password, 12),
        role: 'ADMINISTRATOR',
      },
    });

    await this.logAudit('Administrator account created.');
  }

  async testProtectConnection(input: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }> {
    const payload = protectConnectionSchema.parse(input);
    return this.deps.protectClient.testConnection(payload);
  }

  async saveProtectConnection(input: ProtectConnectionInput): Promise<void> {
    const payload = protectConnectionSchema.parse(input);

    await this.writeSetting(SETTING_KEYS.protect, {
      host: payload.host,
      port: payload.port,
      username: payload.username,
      encryptedPassword: encryptString(payload.password, this.deps.instanceSecret),
      allowSelfSignedCertificate: payload.allowSelfSignedCertificate,
      savedAt: new Date().toISOString(),
    });

    this.deps.eventBus.emit('protect.connection', {
      status: 'pending',
      at: new Date().toISOString(),
      detail: 'Protect configuration stored.',
    });
  }

  async saveFarmProfile(input: FarmProfileInput): Promise<void> {
    const payload = farmProfileSchema.parse(input);
    await this.writeSetting(SETTING_KEYS.farm, payload);
  }

  async saveDashboardPreferences(input: DashboardPreferencesInput): Promise<void> {
    const payload = dashboardPreferencesSchema.parse(input);
    await this.writeSetting(SETTING_KEYS.dashboard, payload);
  }

  async discoverProtectDevices(): Promise<{
    discovered: number;
    saved: number;
    online: number;
    offline: number;
    byKind: Partial<Record<DeviceKind, number>>;
  }> {
    const discoveredDevices = await this.fetchProtectDevices();

    return this.persistProtectDevices(discoveredDevices);
  }

  async refreshProtectDevicesIfStale(maxAgeMs = 4000): Promise<void> {
    const now = Date.now();

    if (this.lastProtectSyncAt > 0 && now - this.lastProtectSyncAt < maxAgeMs) {
      return;
    }

    if (this.protectSyncInFlight) {
      await this.protectSyncInFlight;
      return;
    }

    this.protectSyncInFlight = this.fetchProtectDevices()
      .then((devices) => this.persistProtectDevices(devices))
      .then(() => {
        this.lastProtectSyncAt = Date.now();
      })
      .finally(() => {
        this.protectSyncInFlight = null;
      });

    await this.protectSyncInFlight;
  }

  private async fetchProtectDevices() {
    const protectSettings = await this.readSetting<StoredProtectConnection>(SETTING_KEYS.protect);

    if (!protectSettings) {
      throw new Error('Protect connection must be configured before discovery can run.');
    }

    return this.deps.protectClient.discoverDevices({
      host: protectSettings.host,
      port: protectSettings.port,
      username: protectSettings.username,
      password: decryptString(protectSettings.encryptedPassword, this.deps.instanceSecret),
      allowSelfSignedCertificate: protectSettings.allowSelfSignedCertificate ?? true,
    });
  }

  private async persistProtectDevices(discoveredDevices: Awaited<ReturnType<ProtectClient['discoverDevices']>>): Promise<{
    discovered: number;
    saved: number;
    online: number;
    offline: number;
    byKind: Partial<Record<DeviceKind, number>>;
  }> {

    let saved = 0;
    let online = 0;
    const byKind: Partial<Record<DeviceKind, number>> = {};

    for (const device of discoveredDevices) {
      const kind = mapProtectCategoryToDeviceKind(device.category);

      await this.deps.prisma.device.upsert({
        where: {
          provider_externalId: {
            provider: 'unifi-protect',
            externalId: device.externalId,
          },
        },
        update: {
          name: device.name,
          kind,
          isOnline: device.isOnline,
          metadata: device.metadata as Prisma.InputJsonValue,
          lastSeenAt: new Date(),
        },
        create: {
          provider: 'unifi-protect',
          externalId: device.externalId,
          name: device.name,
          kind,
          isOnline: device.isOnline,
          metadata: device.metadata as Prisma.InputJsonValue,
          lastSeenAt: new Date(),
        },
      });

      saved += 1;
      if (device.isOnline) {
        online += 1;
      }
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }

    this.deps.eventBus.emit('protect.connection', {
      status: 'connected',
      at: new Date().toISOString(),
      detail: `Discovered ${discoveredDevices.length} devices from Protect bootstrap.`,
    });

    return {
      discovered: discoveredDevices.length,
      saved,
      online,
      offline: Math.max(discoveredDevices.length - online, 0),
      byKind,
    };
  }

  async getProtectConnectionInput(): Promise<ProtectConnectionInput> {
    const protectSettings = await this.readSetting<StoredProtectConnection>(SETTING_KEYS.protect);

    if (!protectSettings) {
      throw new Error('Protect connection must be configured before requesting live device data.');
    }

    return {
      host: protectSettings.host,
      port: protectSettings.port,
      username: protectSettings.username,
      password: decryptString(protectSettings.encryptedPassword, this.deps.instanceSecret),
      allowSelfSignedCertificate: protectSettings.allowSelfSignedCertificate ?? true,
    };
  }

  async finishSetup(): Promise<void> {
    const bootstrapState = await this.getBootstrapState();

    if (!bootstrapState.administratorCreated) {
      throw new Error('Administrator must be created before setup can finish.');
    }

    await this.writeSetting(SETTING_KEYS.systemSetup, {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      setupComplete: true,
    });

    this.deps.eventBus.emit('bootstrap.updated', {
      setupComplete: true,
      at: new Date().toISOString(),
    });
  }

  async restartSetup(): Promise<void> {
    await this.writeSetting(SETTING_KEYS.systemSetup, {
      restartedAt: new Date().toISOString(),
      setupComplete: false,
    });

    this.deps.eventBus.emit('bootstrap.updated', {
      setupComplete: false,
      at: new Date().toISOString(),
    });
  }

  async authenticate(input: LoginRequest) {
    const payload = loginRequestSchema.parse(input);
    const user = await this.deps.prisma.user.findUnique({
      where: {
        username: payload.username,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);
    if (!passwordMatches) {
      return null;
    }

    await this.deps.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  private async readSetting<T>(key: string): Promise<T | null> {
    const record = await this.deps.prisma.setting.findUnique({ where: { key } });
    return record ? (record.value as T) : null;
  }

  private async writeSetting(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.deps.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  private async logAudit(action: string): Promise<void> {
    const createdAt = new Date().toISOString();

    await this.deps.prisma.auditLog.create({
      data: {
        action,
        payload: {
          createdAt,
        },
      },
    });

    this.deps.eventBus.emit('audit.logged', {
      action,
      at: createdAt,
    });
  }
}

function mapProtectCategoryToDeviceKind(category: string): DeviceKind {
  switch (category) {
    case 'cameras':
      return 'CAMERA';
    case 'lights':
      return 'LIGHT';
    case 'sensors':
      return 'SENSOR';
    case 'doorlocks':
      return 'LOCK';
    case 'bridges':
      return 'HUB';
    default:
      return 'OTHER';
  }
}
