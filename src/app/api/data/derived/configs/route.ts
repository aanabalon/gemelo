import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configs = await prisma.energyConfig.findMany({
    where: { enabled: true },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      description: true,
    },
  });

  return NextResponse.json(configs);
}
