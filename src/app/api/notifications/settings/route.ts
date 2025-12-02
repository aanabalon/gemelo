import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { NotificationEventType, Prisma } from '@prisma/client';
import { z } from 'zod';

const TUNNEL_ID = 'tunnel-9';

const payloadSchema = z.object({
  event: z.nativeEnum(NotificationEventType),
  enabled: z.boolean(),
  name: z.string().optional(),
  recipients: z.array(z.string()).default([]),
  percentageThreshold: z.number().min(1).max(1000).optional(),
});

const requiresPercentage = new Set<NotificationEventType>([
  NotificationEventType.SETPOINT_PERCENT,
]);

const sanitizeRecipients = (raw: string[]) =>
  raw
    .map((entry) => entry.trim())
    .filter((entry, index, self) => entry.length > 0 && self.indexOf(entry) === index);

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rules = await prisma.notificationRule.findMany({
      where: { tunnelId: TUNNEL_ID },
      orderBy: { event: 'asc' },
    });

    return NextResponse.json(rules);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      console.warn(
        '[Notifications API] NotificationRule table not found. Did you run the migration?'
      );
      return NextResponse.json([]);
    }
    console.error('[Notifications API] Failed to load rules', error);
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    if (
      payload.enabled &&
      requiresPercentage.has(payload.event) &&
      (payload.percentageThreshold === undefined ||
        Number.isNaN(payload.percentageThreshold))
    ) {
      return NextResponse.json(
        { error: 'Missing percentageThreshold for this event' },
        { status: 400 }
      );
    }

    const recipients = sanitizeRecipients(payload.recipients);

    const rule = await prisma.notificationRule.upsert({
      where: {
        event_tunnelId: {
          event: payload.event,
          tunnelId: TUNNEL_ID,
        },
      },
      update: {
        enabled: payload.enabled,
        name: payload.name,
        recipients,
        percentageThreshold: payload.percentageThreshold ?? null,
      },
      create: {
        event: payload.event,
        enabled: payload.enabled,
        name: payload.name,
        recipients,
        tunnelId: TUNNEL_ID,
        percentageThreshold: payload.percentageThreshold ?? null,
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      console.warn(
        '[Notifications API] Cannot save rule because NotificationRule table is missing'
      );
      return NextResponse.json(
        { error: 'Notification tables are not available. Run the migrations.' },
        { status: 500 }
      );
    }
    console.error('[Notifications] Failed to save rule', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
