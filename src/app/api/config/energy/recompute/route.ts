import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recomputeDerivedValues } from '@/lib/derivedValues';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const id = body?.id;
    const fromScratch = Boolean(body?.fromScratch);

    if (!id) {
      return NextResponse.json({ error: 'Missing config id' }, { status: 400 });
    }

    const config = await prisma.energyConfig.findUnique({ where: { id } });
    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    await recomputeDerivedValues(config, { fromScratch });

    return NextResponse.json({
      ok: true,
      message: 'Recompute started',
    });
  } catch (error) {
    console.error('Energy config recompute failed', error);
    return NextResponse.json({ error: 'Failed to start recompute' }, { status: 500 });
  }
}
