import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  readCycleLogicConfig,
  writeCycleLogicConfig,
} from '@/lib/cycleLogicConfig';

async function ensureAdmin() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const auth = await ensureAdmin();
  if (auth) return auth;

  const config = await readCycleLogicConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  const auth = await ensureAdmin();
  if (auth) return auth;

  const body = await request.json();
  const parsed = {
    minRiseDegrees: Number(body.minRiseDegrees),
    riseWindowMinutes: Number(body.riseWindowMinutes),
    minSlope: Number(body.minSlope),
    slopeDurationMinutes: Number(body.slopeDurationMinutes),
    minDefrostTemperature: Number(body.minDefrostTemperature),
    minDefrostSeparationMinutes: Number(body.minDefrostSeparationMinutes),
    minCycleHours: Number(body.minCycleHours),
    maxCycleHours: Number(body.maxCycleHours),
    operationStartValue: Number(body.operationStartValue),
    operationEndValue: Number(body.operationEndValue),
    cycleEnergySetPoint: Number(body.cycleEnergySetPoint),
    minOperationZeroMinutesForEndReal: Number(body.minOperationZeroMinutesForEndReal),
  };

  const config = await writeCycleLogicConfig(parsed);
  return NextResponse.json(config);
}
