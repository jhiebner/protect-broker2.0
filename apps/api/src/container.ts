import { EventBus } from '@protect-broker/broker-core';
import { createPrismaClient } from '@protect-broker/database';
import { UnifiProtectClient, type ProtectClient } from '@protect-broker/protect-client';

import { BootstrapService } from './services/bootstrap-service.js';

export interface AppContainer {
  eventBus: EventBus;
  prisma: ReturnType<typeof createPrismaClient>;
  protectClient: ProtectClient;
  bootstrapService: BootstrapService;
}

export function createContainer(instanceSecret: Buffer): AppContainer {
  const prisma = createPrismaClient();
  const eventBus = new EventBus();
  const protectClient = new UnifiProtectClient();
  const bootstrapService = new BootstrapService({
    prisma,
    protectClient,
    eventBus,
    instanceSecret,
  });

  return {
    prisma,
    eventBus,
    protectClient,
    bootstrapService,
  };
}
