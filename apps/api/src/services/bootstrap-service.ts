import bcrypt from 'bcrypt';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { EventBus } from '@protect-broker/broker-core';
import type { StubProtectClient } from '@protect-broker/protect-client';
import {
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

import { encryptString } from '../lib/crypto.js';

const SETTING_KEYS = {
  systemSetup: 'system.setup',
  protect: 'protect.connection',
  farm: 'farm.profile',
  dashboard: 'dashboard.preferences',
} as const;

interface BootstrapServiceDependencies {
  prisma: PrismaClient;
  protectClient: StubProtectClient;
  eventBus: EventBus;
  instanceSecret: Buffer;
}

export class BootstrapService {
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
      detail: 'Protect configuration stored. Live connection arrives in Phase 2.',
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
