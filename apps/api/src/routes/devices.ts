import type { FastifyInstance } from 'fastify';

import type { AppContainer } from '../container.js';

function readNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function toMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export async function registerDeviceRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get('/api/devices', async (request) => {
    await request.jwtVerify();

    const devices = await container.prisma.device.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return {
      devices: devices.map((device) => ({
        ...(function mapDevice() {
          const metadata = toMetadataRecord(device.metadata);
          const sensorState =
            device.kind === 'SENSOR'
              ? {
                  state: readString(metadata, ['state', 'sensorStatus', 'status']) ?? 'unknown',
                  batteryLevel: readNumber(metadata, ['battery', 'batteryLevel', 'batteryPercent']),
                  signalLevel: readNumber(metadata, ['signalStrength', 'signalLevel', 'rssi']),
                }
              : null;

          return {
            sensorState,
            cameraSnapshotUrl:
              device.kind === 'CAMERA' ? `/api/devices/${device.id}/snapshot` : null,
          };
        })(),
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

  app.get('/api/devices/:id/snapshot', async (request, reply) => {
    await request.jwtVerify();

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ message: 'Device id is required.' });
    }

    const device = await container.prisma.device.findUnique({
      where: {
        id: params.id,
      },
    });

    if (!device) {
      return reply.code(404).send({ message: 'Device not found.' });
    }

    if (device.kind !== 'CAMERA' || device.provider !== 'unifi-protect') {
      return reply.code(400).send({ message: 'Snapshot is only available for Protect camera devices.' });
    }

    const protectConnection = await container.bootstrapService.getProtectConnectionInput();
    const snapshot = await container.protectClient.getCameraSnapshot(protectConnection, device.externalId);

    reply.header('Content-Type', snapshot.contentType);
    reply.header('Cache-Control', 'no-store');
    return reply.send(snapshot.imageBytes);
  });
}
