import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import z from 'zod';
import argon2 from 'argon2';

export interface AuthDeps {
  db: { user: Pick<PrismaClient['user'], 'findUnique' | 'create'> };
}

const reqSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(48),
});

export function authRoutes(app: FastifyInstance, { db }: AuthDeps) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = reqSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: z.flattenError(parsed.error) });
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (user) {
      return reply.status(409).send({ error: 'You are already registered' });
    }
    const passHash = await argon2.hash(parsed.data.password);
    const newUser = await db.user.create({
      data: {
        email: parsed.data.email,
        passwordHash: passHash,
        name: parsed.data.name,
      },
    });

    const newReply = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    };

    return reply.status(201).send(newReply);
  });
}
