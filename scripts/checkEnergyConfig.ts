import { prisma } from '../src/lib/prisma';

async function main() {
  try {
    const configs = await prisma.energyConfig.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    console.log(JSON.stringify(configs, null, 2));
  } catch (e) {
    console.error('Error querying EnergyConfig:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
