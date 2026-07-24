import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

const socketPlugin: FastifyPluginAsync = async (app) => {
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  app.decorate('io', io);

  app.addHook('onClose', async () => {
    await io.close();
  });
};

export default fp(socketPlugin, {
  name: 'socket-plugin',
});
