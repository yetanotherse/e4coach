/**
 * Prisma client singleton. Avoids exhausting connections in dev/hot-reload.
 */
import { PrismaClient } from '../generated/client/index.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '../generated/client/index.js';
