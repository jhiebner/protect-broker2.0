import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export async function registerStaticWeb(app: FastifyInstance, webDistDir: string): Promise<void> {
  if (!existsSync(webDistDir)) {
    app.log.info({ webDistDir }, 'Web dist directory not found, skipping static asset registration.');
    return;
  }

  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: '/',
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
      reply.code(404).send({ message: 'Not Found' });
      return;
    }

    void reply.sendFile('index.html');
  });
}
