import type { FastifyInstance } from 'fastify';

import { loginRequestSchema } from '@protect-broker/shared';

import type { AppContainer } from '../container.js';

export async function registerAuthRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);
    const user = await container.bootstrapService.authenticate(payload);

    if (!user) {
      return reply.code(401).send({ message: 'Invalid username or password.' });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      role: user.role,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  });

  app.get('/api/auth/me', async (request, reply) => {
    await request.jwtVerify();
    return {
      user: request.user,
    };
  });
}
