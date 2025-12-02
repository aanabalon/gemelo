import { NotificationEventType, Prisma, type Cycle, type NotificationRule } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail } from './mailer';

type CyclePointForNotification = {
  timestamp: Date;
  energyAccumulated: number;
};

interface EventResult {
  timestamp: Date;
  subject: string;
  message: string;
}

const EVENT_TITLES: Record<NotificationEventType, string> = {
  [NotificationEventType.CYCLE_STARTED]: 'Inicio de ciclo',
  [NotificationEventType.SETPOINT_REACHED]: 'Set point alcanzado',
  [NotificationEventType.CYCLE_COMPLETED]: 'Ciclo completado',
  [NotificationEventType.SETPOINT_PERCENT]: 'Ciclo alcanzó porcentaje configurado',
};

const formatTimestamp = (value: Date | null | undefined) =>
  value ? value.toISOString().replace('T', ' ').replace('Z', ' UTC') : 'N/D';

const findPointForEnergy = (points: CyclePointForNotification[], target: number) =>
  points.find((point) => (point.energyAccumulated ?? 0) >= target);

function buildBaseMessage(cycle: Cycle): string {
  return [
    `Túnel: ${cycle.tunnelId}`,
    `Inicio real: ${formatTimestamp(cycle.startReal)}`,
    `Fin real: ${formatTimestamp(cycle.endReal)}`,
    `Energía acumulada: ${cycle.energyAccumulatedTotal?.toFixed(2) ?? '0'} kWh`,
    `Set point configurado: ${cycle.setPoint?.toFixed(2) ?? '0'} kWh`,
  ].join('\n');
}

function buildEventResult(
  rule: NotificationRule,
  cycle: Cycle,
  points: CyclePointForNotification[]
): EventResult | null {
  switch (rule.event) {
    case NotificationEventType.CYCLE_STARTED: {
      return {
        timestamp: cycle.startReal,
        subject: `[Gemelo] ${EVENT_TITLES[rule.event]} (${cycle.tunnelId})`,
        message: `${EVENT_TITLES[rule.event]} detectado.\n${buildBaseMessage(cycle)}`,
      };
    }
    case NotificationEventType.SETPOINT_REACHED: {
      if (!cycle.setPoint || cycle.setPoint <= 0) return null;
      const point = findPointForEnergy(points, cycle.setPoint);
      if (!point) return null;
      return {
        timestamp: point.timestamp,
        subject: `[Gemelo] ${EVENT_TITLES[rule.event]} (${cycle.tunnelId})`,
        message: `${EVENT_TITLES[rule.event]} a las ${formatTimestamp(point.timestamp)}.\n${buildBaseMessage(cycle)}`,
      };
    }
    case NotificationEventType.CYCLE_COMPLETED: {
      if (!cycle.endReal) return null;
      return {
        timestamp: cycle.endReal,
        subject: `[Gemelo] ${EVENT_TITLES[rule.event]} (${cycle.tunnelId})`,
        message: `${EVENT_TITLES[rule.event]} a las ${formatTimestamp(cycle.endReal)}.\n${buildBaseMessage(cycle)}`,
      };
    }
    case NotificationEventType.SETPOINT_PERCENT: {
      if (!rule.percentageThreshold || !cycle.setPoint || cycle.setPoint <= 0) return null;
      const requiredEnergy = cycle.setPoint * (rule.percentageThreshold / 100);
      const point = findPointForEnergy(points, requiredEnergy);
      if (!point) return null;
      return {
        timestamp: point.timestamp,
        subject: `[Gemelo] ${rule.percentageThreshold}% del set point (${cycle.tunnelId})`,
        message: [
          `El ciclo alcanzó el ${rule.percentageThreshold}% del set point a las ${formatTimestamp(point.timestamp)}.`,
          `Energía objetivo parcial: ${requiredEnergy.toFixed(2)} kWh`,
          buildBaseMessage(cycle),
        ].join('\n'),
      };
    }
    default:
      return null;
  }
}

export async function triggerCycleNotifications(
  cycle: Cycle,
  points: CyclePointForNotification[]
) {
  let rules: NotificationRule[];
  try {
    rules = await prisma.notificationRule.findMany({
      where: { enabled: true, tunnelId: cycle.tunnelId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    ) {
      console.warn(
        '[Notifications] NotificationRule table missing. Skipping notifications until migration is applied.'
      );
      return;
    }
    throw error;
  }

  if (!rules.length) return;

  for (const rule of rules) {
    try {
      const eventResult = buildEventResult(rule, cycle, points);
      if (!eventResult) continue;

      const alreadySent = await prisma.notificationLog.findUnique({
        where: {
          ruleId_tunnelId_cycleStart: {
            ruleId: rule.id,
            tunnelId: cycle.tunnelId,
            cycleStart: cycle.startReal,
          },
        },
      });
      if (alreadySent) continue;

      const recipients = (rule.recipients ?? [])
        .map((recipient) => recipient?.trim?.())
        .filter((recipient): recipient is string => Boolean(recipient));
      if (!recipients.length) continue;

      await sendNotificationEmail({
        to: recipients,
        subject: eventResult.subject,
        text: eventResult.message,
      });

      await prisma.notificationLog.create({
        data: {
          ruleId: rule.id,
          cycleId: cycle.id,
          tunnelId: cycle.tunnelId,
          cycleStart: cycle.startReal,
          event: rule.event,
          percentageThreshold: rule.percentageThreshold,
        },
      });
    } catch (error) {
      console.error('[Notifications] Failed to process rule', {
        ruleId: rule.id,
        event: rule.event,
        error,
      });
    }
  }
}
