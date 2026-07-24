import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySensible from '@fastify/sensible';
import Fastify from 'fastify';

import { config } from './lib/config.js';
import { getFastifyLoggerOptions } from './lib/logger.js';
import { readOrCreateInstanceSecret } from './lib/secrets.js';
import socketPlugin from './plugins/socket.js';
import { registerStaticWeb } from './plugins/static-web.js';
import { createContainer } from './container.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBootstrapRoutes } from './routes/bootstrap.js';
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
  await app.register(fastifySensible);
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

  await registerHealthRoutes(app);
  await registerBootstrapRoutes(app, container);
  await registerAuthRoutes(app, container);
  await registerSetupRoutes(app, container);
  await registerStaticWeb(app, config.PB_WEB_DIST_DIR);

  app.addHook('onClose', async () => {
    await container.prisma.$disconnect();
  });

  return app;
}
