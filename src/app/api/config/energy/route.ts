import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recomputeDerivedValues, purgeDerivedValues } from '@/lib/derivedValues';
import { MIN_REAL_CONFIG_NAME } from '@/lib/energy/constants';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const configs = await prisma.energyConfig.findMany({
        where: { name: { not: MIN_REAL_CONFIG_NAME } },
        orderBy: { name: 'asc' },
    });
    return NextResponse.json(configs);
}

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
        const { name, expression, description, enabled } = body;

        if (name === MIN_REAL_CONFIG_NAME) {
            return NextResponse.json({ error: 'Config reservada para uso interno' }, { status: 400 });
        }
 
        const existing = await prisma.energyConfig.findUnique({ where: { name } });
        const isNew = !existing;
        const expressionChanged = existing && existing.expression !== expression;
        const wasDisabled = existing && !existing.enabled;
        const shouldRecompute = isNew || expressionChanged || (wasDisabled && enabled);

        let config;
        if (!existing) {
            config = await prisma.energyConfig.create({
                data: {
                    name,
                    expression,
                    description,
                    enabled,
                    lastProcessedAt: shouldRecompute ? null : undefined,
                },
            });
        } else {
            config = await prisma.energyConfig.update({
                where: { name },
                data: {
                    expression,
                    description,
                    enabled,
                    lastProcessedAt: shouldRecompute ? null : existing.lastProcessedAt,
                },
            });
        }

        if (config.enabled && shouldRecompute) {
            recomputeDerivedValues(config, { fromScratch: true }).catch((error) =>
                console.error('Fallo al recalcular valores derivados', error)
            );
        }

        if (!config.enabled) {
            await purgeDerivedValues(config.id);
        }

        return NextResponse.json(config);
    } catch (error) {
        console.error('Failed to save energy config', error);
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
