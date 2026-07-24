import type { FastifyInstance } from 'fastify';

import type { AppContainer } from '../container.js';

export async function registerDeviceRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get('/api/devices', async () => {
    const devices = await container.prisma.device.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return {
      devices: devices.map((device) => ({
        id: device.id,
        externalId: device.externalId,
        provider: device.provider,
        name: device.name,
        kind: device.kind,
        isOnline: device.isOnline,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      })),
    };
  });
}
