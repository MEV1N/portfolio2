import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Returns whether the scraping, AI audit, and outbound dispatch pipeline is active.
 * Defaults to false (stopped on startup).
 */
export async function isPipelineActive(): Promise<boolean> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'pipelineActive' },
    });
    return config?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Updates the persistent pipelineActive state in PostgreSQL.
 */
export async function setPipelineActive(active: boolean): Promise<boolean> {
  await prisma.systemConfig.upsert({
    where: { key: 'pipelineActive' },
    update: { value: String(active) },
    create: { key: 'pipelineActive', value: String(active) },
  });
  // Keep outreachPaused in sync for backward compatibility
  await prisma.systemConfig.upsert({
    where: { key: 'outreachPaused' },
    update: { value: String(!active) },
    create: { key: 'outreachPaused', value: String(!active) },
  });
  return active;
}

export * from '@prisma/client';
