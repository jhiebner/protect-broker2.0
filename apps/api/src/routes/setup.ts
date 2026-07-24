import type { FastifyInstance } from 'fastify';

import {
  dashboardPreferencesSchema,
  farmProfileSchema,
  protectConnectionSchema,
  setupAdminSchema,
} from '@protect-broker/shared';
import { ZodError } from 'zod';

import type { AppContainer } from '../container.js';

function formatValidationMessage(error: ZodError): string {
  const fieldMessages = error.issues
    .map((issue) => {
      const field = issue.path[0];
      const label = typeof field === 'string' && field.length > 0 ? field : 'field';
      return `${label}: ${issue.message}`;
    })
    .slice(0, 3);

  return fieldMessages.length > 0
    ? `Please review: ${fieldMessages.join('; ')}`
    : 'Invalid setup values.';
}

function sendSetupError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: formatValidationMessage(error) });
  }

  if (error instanceof Error) {
    return reply.code(400).send({ message: error.message });
  }

  return reply.code(400).send({ message: fallbackMessage });
}

export async function registerSetupRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post('/api/setup/admin', async (request, reply) => {
    try {
      const payload = setupAdminSchema.parse(request.body);
      await container.bootstrapService.createAdministrator(payload);
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to create administrator.');
      return sendSetupError(reply, error, 'Unable to create administrator.');
    }
  });

  app.post('/api/setup/protect/test', async (request, reply) => {
    try {
      const payload = protectConnectionSchema.parse(request.body);
      return container.bootstrapService.testProtectConnection(payload);
    } catch (error) {
      request.log.error({ error }, 'Failed to test Protect connection.');
      return sendSetupError(reply, error, 'Unable to test Protect connection.');
    }
  });

  app.post('/api/setup/protect', async (request, reply) => {
    try {
      const payload = protectConnectionSchema.parse(request.body);
      await container.bootstrapService.saveProtectConnection(payload);
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to save Protect connection.');
      return sendSetupError(reply, error, 'Unable to save Protect connection.');
    }
  });

  app.post('/api/setup/farm', async (request, reply) => {
    try {
      const payload = farmProfileSchema.parse(request.body);
      await container.bootstrapService.saveFarmProfile(payload);
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to save farm profile.');
      return sendSetupError(reply, error, 'Unable to save farm profile.');
    }
  });

  app.post('/api/setup/dashboard', async (request, reply) => {
    try {
      const payload = dashboardPreferencesSchema.parse(request.body);
      await container.bootstrapService.saveDashboardPreferences(payload);
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to save dashboard preferences.');
      return sendSetupError(reply, error, 'Unable to save dashboard preferences.');
    }
  });

  app.post('/api/setup/discovery', async (request, reply) => {
    try {
      const result = await container.bootstrapService.discoverProtectDevices();
      return reply.code(200).send(result);
    } catch (error) {
      request.log.error({ error }, 'Failed to discover Protect devices.');
      return sendSetupError(reply, error, 'Unable to discover devices from Protect.');
    }
  });

  app.post('/api/setup/finish', async (request, reply) => {
    try {
      await container.bootstrapService.finishSetup();
      return reply.code(201).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to finish setup.');
      return sendSetupError(reply, error, 'Unable to finish setup.');
    }
  });

  app.post('/api/setup/restart', async (request, reply) => {
    try {
      await request.jwtVerify();
      await container.bootstrapService.restartSetup();
      return reply.code(200).send({ success: true });
    } catch (error) {
      request.log.error({ error }, 'Failed to restart setup.');
      return sendSetupError(reply, error, 'Unable to restart setup.');
    }
  });
}
