import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    // Reduce el pool de conexiones para evitar saturar la base de datos
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;

  // Cleanup en shutdown para desarrollo
  if (!globalForPrisma.prisma) {
    process.on('beforeExit', async () => {
      await prisma.$disconnect();
    });
  }
}
