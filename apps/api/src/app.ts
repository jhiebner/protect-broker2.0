import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';

import { config } from './lib/config.js';
import { getFastifyLoggerOptions } from './lib/logger.js';
import { readOrCreateInstanceSecret } from './lib/secrets.js';
import socketPlugin from './plugins/socket.js';
import { registerStaticWeb } from './plugins/static-web.js';
import { createContainer } from './container.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBootstrapRoutes } from './routes/bootstrap.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSetupRoutes } from './routes/setup.js';

export async function createApp() {
  const app = Fastify({ logger: getFastifyLoggerOptions() });
  const instanceSecret = await readOrCreateInstanceSecret(config.PB_DATA_DIR);
  const container = createContainer(instanceSecret);

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });
  await app.register(fastifyJwt, {
    secret: instanceSecret.toString('base64url'),
  });
  await app.register(socketPlugin);

  container.eventBus.on('bootstrap.updated', (payload) => {
    app.io.emit('bootstrap.updated', payload);
  });

  container.eventBus.on('protect.connection', (payload) => {
    app.io.emit('protect.connection', payload);
  });

  const startProtectSubscription = async () => {
    const bootstrapState = await container.bootstrapService.getBootstrapState();

    if (!bootstrapState.setupComplete || !bootstrapState.protectConfigured) {
      await container.protectClient.unsubscribeFromDevices();
      return;
    }

    const protectConnection = await container.bootstrapService.getProtectConnectionInput();
    await container.protectClient.subscribeToDevices(protectConnection, async () => {
      try {
        await container.bootstrapService.refreshProtectDevicesIfStale(0);
        app.io.emit('devices.updated', {
          at: new Date().toISOString(),
        });
      } catch (error) {
        app.log.debug({ error }, 'Protect device refresh from websocket event failed.');
      }
    });
  };

  const protectSubscriptionCheckIntervalId = setInterval(() => {
    void (async () => {
      try {
        await startProtectSubscription();
      } catch (error) {
        app.log.debug({ error }, 'Protect device subscription check skipped.');
      }
    })();
  }, 5000);

  const fallbackProtectRefreshIntervalId = setInterval(() => {
    void (async () => {
      try {
        const bootstrapState = await container.bootstrapService.getBootstrapState();

        if (!bootstrapState.setupComplete || !bootstrapState.protectConfigured) {
          return;
        }

        await container.bootstrapService.refreshProtectDevicesIfStale(0);
        app.io.emit('devices.updated', {
          at: new Date().toISOString(),
        });
      } catch (error) {
        app.log.debug({ error }, 'Fallback Protect refresh skipped.');
      }
    })();
  }, 30000);

  void startProtectSubscription().catch((error) => {
    app.log.debug({ error }, 'Initial Protect device subscription skipped.');
  });

  await registerHealthRoutes(app);
  await registerDeviceRoutes(app, container);
  await registerBootstrapRoutes(app, container);
  await registerAuthRoutes(app, container);
  await registerSetupRoutes(app, container);
  await registerStaticWeb(app, config.PB_WEB_DIST_DIR);

  app.addHook('onClose', async () => {
    clearInterval(protectSubscriptionCheckIntervalId);
    clearInterval(fallbackProtectRefreshIntervalId);
    await container.protectClient.unsubscribeFromDevices();
    await container.prisma.$disconnect();
  });

  return app;
}
