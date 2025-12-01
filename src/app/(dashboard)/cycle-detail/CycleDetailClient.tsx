'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  TimeScale,
  Filler,
  Tooltip,
  Legend
);


interface CyclePoint {
  timestamp: string;
  avgSerpentin: number;
  avgDoor: number;
  operationState: number;
  energyAccumulated: number;
}

interface CycleDetail {
  id: number;
  displayIndex?: number;
  start: string | null;
  end: string | null;
  endEstimated: string | null;
  isCurrent: boolean;
  durationHours: number;
  dischargeTime: string | null;
  energyAccumulatedTotal: number;
  activeTimeMinutes: number | null;
  overfrozenTimeMinutes: number | null;
  setPoint?: number | null;
  points: CyclePoint[];
}

interface CycleStatus {
  phase: 'idle' | 'running' | 'ready';
  reachedSetpoint: boolean;
  reachedSetpointAt: string | null;
  progress: number;
}

export function CycleDetailClient() {
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setPointConfig, setSetPointConfig] = useState<number | null>(null);
  const [status, setStatus] = useState<CycleStatus | null>(null);
  const prevPhase = useRef<'idle' | 'running' | 'ready'>('idle');
  const chartRef = useRef<any>(null);

  // Register zoom plugin when component mounts
  useEffect(() => {
    import('chartjs-plugin-zoom')
      .then((mod) => {
        try {
          ChartJS.register(mod.default);
        } catch (e) {
          // already registered
        }
      })
      .catch((err) => {
        console.error('Failed to load chartjs-plugin-zoom', err);
      });
  }, []);

  const displaySetPoint =
    typeof setPointConfig === 'number' && setPointConfig > 0
      ? setPointConfig
      : null;

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cycle/latest');
      if (!response.ok) {
        console.error('Error fetching latest cycle', response.status);
        setCycle(null);
        setError('No se pudo cargar el ciclo actual');
        return;
      }
      const data = await response.json();
      // Handle new API format: { ok: true, cycle: ... }
      if (!data.cycle) {
        setCycle(null);
        return;
      }
      setCycle(data.cycle);
    } catch (err: any) {
      console.error('Error fetching latest cycle:', err);
      setCycle(null);
      setError('No se pudo cargar el ciclo actual');
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling for status
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch('/api/cycle/current-status');
        if (res.ok) {
          const data = await res.json();
          if (data.cycle) {
            const newStatus = {
              phase: data.cycle.phase,
              reachedSetpoint: data.cycle.reachedSetpoint,
              reachedSetpointAt: data.cycle.reachedSetpointAt,
              progress: data.cycle.progress,
            };
            setStatus(newStatus);

            // Alerts
            if (prevPhase.current === 'idle' && newStatus.phase === 'running') {
              toast.info('Ciclo iniciado');
              fetchLatest(); // Refresh full data
            } else if (prevPhase.current === 'running' && newStatus.phase === 'ready') {
              toast.success('Ciclo listo / setpoint alcanzado');
              fetchLatest(); // Refresh full data
            }

            prevPhase.current = newStatus.phase;
          }
        }
      } catch (e) {
        console.error('Error polling status', e);
      }
    };

    pollStatus(); // Initial call
    const interval = setInterval(pollStatus, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [fetchLatest]);

  useEffect(() => {
    fetchLatest();
    const interval = setInterval(fetchLatest, 60_000); // Poll every 60s for new data points
    return () => clearInterval(interval);
  }, [fetchLatest]);

  useEffect(() => {
    const handler = () => {
      fetchLatest().then(() => {
        toast.success('Ciclo actualizado');
      });
    };
    window.addEventListener('cycles-recalculated', handler);
    return () => window.removeEventListener('cycles-recalculated', handler);
  }, [fetchLatest]);

  useEffect(() => {
    fetch('/api/cycle-logic')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.cycleEnergySetPoint === 'number') {
          setSetPointConfig(data.cycleEnergySetPoint);
        }
      })
      .catch((err) =>
        console.error('No se pudo cargar el set point energético', err)
      );
  }, []);

  const chartData = useMemo<ChartData<'line'> | null>(() => {
    if (!cycle) return null;

    const datasets: any[] = [
      {
        label: 'Promedio Serpentín',
        borderColor: '#1D4ED8',
        backgroundColor: '#1D4ED8',
        data: cycle.points.map((point) => ({
          x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
          y: point.avgSerpentin ?? null,
        })),
        yAxisID: 'temp',
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Promedio Puerta',
        borderColor: '#60A5FA',
        backgroundColor: '#60A5FA',
        data: cycle.points.map((point) => ({
          x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
          y: point.avgDoor ?? null,
        })),
        yAxisID: 'temp',
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Estado de Operación',
        borderColor: '#f97316',
        stepped: true,
        fill: false,
        data: cycle.points.map((point) => ({
          x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
          y: point.operationState ?? null,
        })),
        yAxisID: 'state',
        pointRadius: 0,
        borderWidth: 3,
      },
      {
        label: 'Energía Acumulada [kWh]',
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        fill: true,
        data: cycle.points.map((point) => ({
          x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
          y: point.energyAccumulated ?? null,
        })),
        yAxisID: 'energy',
        pointRadius: 0,
        borderWidth: 2,
      },
    ];

    if (displaySetPoint) {
      datasets.push({
        label: 'Set point energético',
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.25)',
        data: cycle.points.map((point) => ({
          x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
          y: displaySetPoint,
        })),
        yAxisID: 'energy',
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [6, 6],
        fill: false,
      });
    }

    return { datasets };
  }, [cycle, displaySetPoint]);

  const chartOptions = useMemo<ChartOptions<'line'>>(() => {
    const firstTimestamp = cycle && cycle.points && cycle.points.length ? new Date(cycle.points[0].timestamp).getTime() : null;
    const lastTimestamp = cycle && cycle.points && cycle.points.length ? new Date(cycle.points[cycle.points.length - 1].timestamp).getTime() : null;

    return {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        zoom: {
          pan: { enabled: true, mode: 'x' as const, modifierKey: 'ctrl' },
          zoom: {
            wheel: { enabled: false },
            pinch: { enabled: true },
            drag: { enabled: true, borderColor: 'rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.08)' },
            mode: 'x' as const,
          },
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          time: { tooltipFormat: 'dd/MM HH:mm:ss' },
          position: 'bottom' as const,
          ticks: {
            callback: function (value: number | string) {
              const dateValue = typeof value === 'number' ? value : new Date(value as string).getTime();
              if (!Number.isFinite(dateValue)) return '';
              const date = new Date(dateValue);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              return `${day}/${month} ${hours}:${minutes}`;
            },
          },
        },
        hours: {
          type: 'time' as const,
          position: 'top' as const,
          time: { unit: 'hour' as const },
          min: firstTimestamp ?? undefined,
          max: lastTimestamp ?? undefined,
          grid: { drawOnChartArea: false },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 15,
            callback: function (value: number | string) {
              if (!cycle || !cycle.points || !cycle.points.length || firstTimestamp === null) return '';
              const numericValue = typeof value === 'number' ? value : new Date(value as string).getTime();
              if (!Number.isFinite(numericValue)) return '';
              const hours = (numericValue - firstTimestamp) / 3600000;
              if (hours < 0 || !Number.isFinite(hours)) return '';
              return Math.floor(hours);
            },
          },
        },
        temp: { type: 'linear' as const, position: 'left' as const, title: { display: true, text: '°C' } },
        state: {
          type: 'linear' as const,
          position: 'right' as const,
          min: -0.01,
          max: 1.01,
          ticks: {
            stepSize: 1,
            callback: function (value: number | string) {
              const numeric = typeof value === 'number' ? value : Number(value);
              return numeric < 0.5 ? '0' : '1';
            },
          },
        },
        energy: { type: 'linear' as const, position: 'right' as const, grid: { drawOnChartArea: false }, title: { display: true, text: 'kWh' } },
      },
    } as ChartOptions<'line'>;
  }, [cycle]);

  const handleResetZoom = () => {
    try {
      chartRef.current?.resetZoom?.();
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-screen pt-1">
      <div className="flex items-center justify-between py-1 px-2 shrink-0">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-slate-900">
            Ciclo actual
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualización del último ciclo detectado automáticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge variant={status.phase === 'ready' ? 'default' : status.phase === 'running' ? 'secondary' : 'outline'}>
              {status.phase === 'ready' ? 'Listo' : status.phase === 'running' ? 'En curso' : 'Esperando'}
            </Badge>
          )}
          <Button variant="outline" onClick={fetchLatest} disabled={loading}>
            Actualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="p-2 flex h-36 items-center justify-center">
              Cargando ciclo...
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="p-2 flex h-36 items-center justify-center text-destructive">
              {error}
            </CardContent>
          </Card>
        </div>
      ) : cycle ? (
        <div className="flex-1 overflow-auto p-2">
          {/* Cards grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Momentos</CardTitle>
              </CardHeader>
              <CardContent className="p-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Inicio Real</p>
                  <p className="text-base font-medium">
                    {cycle.start ? format(new Date(cycle.start), 'dd/MM/yyyy HH:mm') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fin Real</p>
                  <p className="text-base font-medium">
                    {cycle.end ? format(new Date(cycle.end), 'dd/MM/yyyy HH:mm') : 'En curso'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Descarga</p>
                  <p className="text-base font-medium">
                    {cycle.isCurrent
                      ? '—'
                      : (cycle.dischargeTime
                        ? format(new Date(cycle.dischargeTime), 'dd/MM/yyyy HH:mm')
                        : '—')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fin Estimado</p>
                  <p className="text-base font-medium">
                    {cycle.endEstimated ? format(new Date(cycle.endEstimated), 'dd/MM/yyyy HH:mm') : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">
                  Detalle del Ciclo {cycle.displayIndex || cycle.id}
                  {cycle.end === null && <Badge className="ml-2">En curso</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Tiempo Fin Real</p>
                  <p className="text-base font-medium">
                    {cycle.durationHours ? `${cycle.durationHours.toFixed(2)} h` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tiempo Estimado</p>
                  <p className="text-base font-medium">
                    {cycle.start && cycle.endEstimated
                      ? `${((new Date(cycle.endEstimated).getTime() - new Date(cycle.start).getTime()) / (1000 * 3600)).toFixed(2)} h`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tiempo Activo</p>
                  <p className="text-base font-medium">
                    {cycle.activeTimeMinutes ? `${(cycle.activeTimeMinutes / 60).toFixed(2)} h` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tiempo Total</p>
                  <p className="text-base font-medium">
                    {cycle.start && cycle.dischargeTime
                      ? `${((new Date(cycle.dischargeTime).getTime() - new Date(cycle.start).getTime()) / (1000 * 3600)).toFixed(2)} h`
                      : '—'}
                  </p>
                </div>
                {/* Tiempo Sobrecongelado removed as requested */}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Energía</CardTitle>
              </CardHeader>
              <CardContent className="p-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Acumulada</p>
                  <p className="text-base font-medium">
                    {(() => {
                      // Prefer explicit total from API/DB when available (finite number).
                      // For open/current cycles the DB value may be missing or stale,
                      // so fall back to the last point's energyAccumulated if present.
                      const totalFromApi = Number.isFinite(cycle.energyAccumulatedTotal)
                        ? cycle.energyAccumulatedTotal
                        : null;
                      const lastPointAccum = cycle.points && cycle.points.length > 0
                        ? cycle.points[cycle.points.length - 1].energyAccumulated
                        : null;
                      const value = totalFromApi ?? (Number.isFinite(lastPointAccum) ? lastPointAccum : null);
                      return value !== null && value !== undefined
                        ? `${Number(value).toFixed(2)} kWh`
                        : '—';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sobrecongelamiento</p>
                  <p className="text-base font-medium text-orange-600">
                    {(cycle.energyAccumulatedTotal !== undefined && cycle.setPoint) ? (() => { const excess = Math.max(0, cycle.energyAccumulatedTotal - cycle.setPoint); return excess > 0 ? `${excess.toFixed(2)} kWh` : '—'; })() : '—'}
                  </p>
                </div>
                {displaySetPoint && (
                  <div>
                    <p className="text-xs text-muted-foreground">Set point energético</p>
                    <p className="text-base font-medium text-orange-600">
                      {`${displaySetPoint.toFixed(2)} kWh`}
                    </p>
                  </div>
                )}
                {status && status.progress > 0 && (
                  <div className="col-span-2 mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Progreso</span>
                      <span>{status.progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${status.reachedSetpoint ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chart below cards */}
          <div className="mt-4">
            <Card className="w-full">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Tendencias del ciclo</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="h-[420px] w-full relative">
                  <div className="absolute right-2 top-2 z-10">
                    <Button aria-label="Reset zoom" size="sm" variant="ghost" onClick={handleResetZoom} className="p-1">
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  {chartData ? (
                    <Line ref={chartRef} data={chartData} options={chartOptions} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      No hay datos para graficar.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
