import type { FastifyInstance } from 'fastify';

import type { AppContainer } from '../container.js';

interface SensorMetric {
  label: string;
  value: string;
}

function readNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readBoolean(metadata: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return null;
}

function getValueAtPath(metadata: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = metadata;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function readNumberAtPaths(metadata: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const value = getValueAtPath(metadata, path);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readStringAtPaths(metadata: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = getValueAtPath(metadata, path);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readBooleanAtPaths(metadata: Record<string, unknown>, paths: string[]): boolean | null {
  for (const path of paths) {
    const value = getValueAtPath(metadata, path);
    if (typeof value === 'boolean') {
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

function boolToState(value: boolean | null, trueLabel: string, falseLabel: string): string | null {
  if (value === null) {
    return null;
  }

  return value ? trueLabel : falseLabel;
}

function buildSensorMetrics(metadata: Record<string, unknown>): SensorMetric[] {
  const metrics: SensorMetric[] = [];

  const openState =
    boolToState(
      readBooleanAtPaths(metadata, [
        'isOpened',
        'isOpen',
        'stats.isOpened',
        'stats.contact.isOpen',
      ]),
      'open',
      'closed',
    ) ??
    boolToState(readBoolean(metadata, ['isOpened', 'isOpen']), 'open', 'closed');

  if (openState) {
    metrics.push({ label: 'Contact', value: openState });
  }

  const motionState = boolToState(
    readBooleanAtPaths(metadata, ['isMotionDetected', 'stats.isMotionDetected', 'stats.motion.isDetected']),
    'detected',
    'clear',
  );
  if (motionState) {
    metrics.push({ label: 'Motion', value: motionState });
  }

  const leakState = boolToState(
    readBooleanAtPaths(metadata, ['isLeakDetected', 'stats.isLeakDetected', 'stats.leak.isDetected']),
    'detected',
    'clear',
  );
  if (leakState) {
    metrics.push({ label: 'Leak', value: leakState });
  }

  const temperature = readNumberAtPaths(metadata, ['stats.temperature.value', 'temperature', 'temperature.value']);
  if (temperature !== null) {
    metrics.push({ label: 'Temperature', value: `${temperature.toFixed(1)} C` });
  }

  const humidity = readNumberAtPaths(metadata, ['stats.humidity.value', 'humidity', 'humidity.value']);
  if (humidity !== null) {
    metrics.push({ label: 'Humidity', value: `${humidity.toFixed(0)}%` });
  }

  const light = readNumberAtPaths(metadata, ['stats.light.value', 'light', 'light.value']);
  if (light !== null) {
    metrics.push({ label: 'Light', value: `${light.toFixed(0)} lux` });
  }

  const coAlarm = boolToState(
    readBooleanAtPaths(metadata, ['isCoAlarmDetected', 'stats.isCoAlarmDetected', 'stats.co.isAlarmDetected']),
    'alarm',
    'clear',
  );
  if (coAlarm) {
    metrics.push({ label: 'CO', value: coAlarm });
  }

  return metrics;
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
                  state:
                    readString(metadata, ['state', 'sensorStatus', 'status']) ??
                    readStringAtPaths(metadata, ['stats.state', 'stats.connectionState']) ??
                    (device.isOnline ? 'CONNECTED' : 'OFFLINE'),
                  batteryLevel:
                    readNumber(metadata, ['battery', 'batteryLevel', 'batteryPercent']) ??
                    readNumberAtPaths(metadata, [
                      'batteryStatus.percentage',
                      'batteryStatus.value',
                      'stats.battery.value',
                      'stats.battery.percentage',
                    ]),
                  signalLevel:
                    readNumber(metadata, ['signalStrength', 'signalLevel', 'rssi']) ??
                    readNumberAtPaths(metadata, [
                      'bluetoothConnectionState.signalQuality',
                      'wifiConnectionState.signalQuality',
                      'stats.signal.value',
                      'stats.signal.rssi',
                    ]),
                  metrics: buildSensorMetrics(metadata),
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
