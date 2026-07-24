import type { FastifyInstance } from 'fastify';

import type { AppContainer } from '../container.js';

export async function registerBootstrapRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get('/api/bootstrap', async () => {
    return container.bootstrapService.getBootstrapState();
  });
}
