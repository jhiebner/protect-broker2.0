import type { FastifyInstance } from 'fastify';

import {
  dashboardPreferencesSchema,
  farmProfileSchema,
  protectConnectionSchema,
  setupAdminSchema,
} from '@protect-broker/shared';
import { ZodError } from 'zod';

import type { AppContainer } from '../container.js';

export async function registerSetupRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post('/api/setup/admin', async (request, reply) => {
    try {
      const payload = setupAdminSchema.parse(request.body);
      await container.bootstrapService.createAdministrator(payload);
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to create administrator.');

      if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? 'Invalid administrator setup values.';
        return reply.code(400).send({ message });
      }

      if (error instanceof Error) {
        return reply.code(400).send({ message: error.message });
      }

      return reply.code(400).send({ message: 'Unable to create administrator.' });
    }
  });

  app.post('/api/setup/protect/test', async (request) => {
    const payload = protectConnectionSchema.parse(request.body);
    return container.bootstrapService.testProtectConnection(payload);
  });

  app.post('/api/setup/protect', async (request, reply) => {
    const payload = protectConnectionSchema.parse(request.body);
    await container.bootstrapService.saveProtectConnection(payload);
    return reply.code(201).send({ success: true });
  });

  app.post('/api/setup/farm', async (request, reply) => {
    const payload = farmProfileSchema.parse(request.body);
    await container.bootstrapService.saveFarmProfile(payload);
    return reply.code(201).send({ success: true });
  });

  app.post('/api/setup/dashboard', async (request, reply) => {
    const payload = dashboardPreferencesSchema.parse(request.body);
    await container.bootstrapService.saveDashboardPreferences(payload);
    return reply.code(201).send({ success: true });
  });

  app.post('/api/setup/finish', async (_request, reply) => {
    await container.bootstrapService.finishSetup();
    return reply.code(201).send({ success: true });
  });
}
