import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import z from 'zod';
import argon2 from 'argon2';

export interface AuthDeps {
  db: { user: Pick<PrismaClient['user'], 'findUnique' | 'create'> };
  isProduction: boolean;
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(48),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export function authRoutes(app: FastifyInstance, { db, isProduction }: AuthDeps) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
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

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: z.flattenError(parsed.error) });
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!isPasswordValid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = await reply.jwtSign({ sub: user.id });
    reply.setCookie('access_token', token, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 900,
    });
    return reply.status(200).send({ id: user.id, email: user.email, name: user.name });
  });
}
