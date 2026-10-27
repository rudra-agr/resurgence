import { PrismaClient } from '@prisma/client';

// Reuse one client in development so hot reloads do not open new connections.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
