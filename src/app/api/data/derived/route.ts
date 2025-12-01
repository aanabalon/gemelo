import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const configsParam = searchParams.get('configs') || '';

  const start = startParam ? new Date(startParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endParam ? new Date(endParam) : new Date();

  const configs = configsParam
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (!configs.length) {
    return NextResponse.json({ configValues: [] });
  }

  const values = await prisma.energyDerivedValue.findMany({
    where: {
      config: {
        name: { in: configs },
      },
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { timestamp: 'asc' },
    include: {
      config: true,
    },
  });

  const grouped: Record<string, Array<{ timestamp: string; value: number }>> = {};

  for (const value of values) {
    const name = value.config.name;
    grouped[name] ??= [];
    grouped[name].push({
      timestamp: value.timestamp.toISOString(),
      value: value.value,
    });
  }

  const configValues = Object.entries(grouped).map(([name, points]) => ({
    name,
    points,
  }));

  return NextResponse.json({ configValues });
}
