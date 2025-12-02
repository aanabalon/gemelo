'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label as UiLabel } from '@/components/ui/label';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { GlobalChart } from './GlobalChart';

// ---------- helpers ----------

const sanitizeKey = (name: string) =>
  `derived_${name.replace(/\s+/g, '_').replace(/\W/g, '')}`;

const safeFormatDate = (
  value: Date | string | number | null | undefined,
  pattern: string,
  options?: Parameters<typeof format>[2],
) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return format(date, pattern, options);
  } catch {
    return '';
  }
};

const DERIVED_CONFIGS = [
  { name: 'Promedio_Serpentin', label: 'T. Promedio Serpentín [ºC]', color: '#1D4ED8' },
  { name: 'Promedio_Puerta', label: 'T. Promedio Puerta [ºC]', color: '#60A5FA' },
  { name: 'Operacion', label: 'Estado de Operación', color: '#f97316' },
  // Se incluye 'Energia' como config derivada para obtener los puntos de energía
  // necesarios para construir la serie acumulada en el gráfico superior.
  { name: 'Energia', label: 'Energía Instantánea [kWh]', color: '#10b981' },
];

const buildDefaultRange = () => ({
  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  end: new Date(),
});

// Formatea la fecha para el input en zona local, no UTC
const formatInputValue = (date: Date) => {
  if (!date) return '';
  // Ajusta a zona local para <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
const getCycleId = (cycle: any) => {
  if (!cycle || cycle.id === null || cycle.id === undefined) return '';
  return typeof cycle.id === 'string' ? cycle.id : String(cycle.id);
};

// ---------- component ----------

export function DashboardClient() {
  const [isClient, setIsClient] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [cycleData, setCycleData] = useState<any>(null);
  const [globalData, setGlobalData] = useState<any[]>([]);
  const [derivedValues, setDerivedValues] = useState<
    Record<
      string,
      { name: string; points: { timestamp: string; value: number }[] }
    >
  >({});
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [range, setRange] = useState(buildDefaultRange);
  const [rangeError, setRangeError] = useState<string | null>(null);
  // State for relative range (e.g., 24h, 7d) to allow dynamic updates
  const [relativeRange, setRelativeRange] = useState<number | null>(24 * 7); // Default to 7 days

  // rango de fecha/hora
  const handleRangeSelect = (field: 'start' | 'end', value: Date | undefined) => {
    if (value) {
      // If user manually selects a date, disable relative/live mode
      setRelativeRange(null);

      if (!Number.isNaN(value.getTime())) {
        setRange(prev => {
          const newRange = { ...prev, [field]: value };
          if (newRange.end < newRange.start) {
            setRangeError('El término debe ser posterior al inicio');
          } else {
            setRangeError(null);
          }
          return newRange;
        });
      }
    }
  };

  const setQuickRange = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    setRange({ start, end });
    setRelativeRange(hours); // Enable relative mode for this duration
    setRangeError(null);
  };

  // carga global (crudo + derivados)
  const fetchGlobalData = useCallback(async () => {
    let start = range.start;
    let end = range.end;

    // If we are in a relative mode, recalculate the window to be "live"
    if (relativeRange) {
      end = new Date();
      start = new Date(end.getTime() - relativeRange * 60 * 60 * 1000);
      // Silently update the range state so the UI reflects it (optional, but good for consistency)
      // setRange({ start, end }); // Avoid causing re-renders loop if not careful, better just use local vars for fetch
    }

    if (end < start) return; // Prevent fetch if invalid

    setLoadingGlobal(true);
    try {
      const configQuery = DERIVED_CONFIGS.map(cfg =>
        encodeURIComponent(cfg.name),
      ).join(',');

      const [rawResponse, derivedResponse] = await Promise.all([
        fetch(
          `/api/data/raw?start=${start.toISOString()}&end=${end.toISOString()}`,
        ),
        fetch(
          `/api/data/derived?start=${start.toISOString()}&end=${end.toISOString()}&configs=${configQuery}`,
        ),
      ]);

      const raw = rawResponse.ok ? await rawResponse.json() : [];
      const derived = derivedResponse.ok ? await derivedResponse.json() : { configValues: [] };

      setGlobalData(raw ?? []);

      const grouped: Record<
        string,
        { name: string; points: { timestamp: string; value: number }[] }
      > = {};

      derived?.configValues?.forEach((entry: any) => {
        grouped[entry.name] = entry;
      });

      setDerivedValues(grouped);
    } catch (error) {
      console.error('Error cargando datos globales:', error);
    } finally {
      setLoadingGlobal(false);
    }
  }, [range.start, range.end, relativeRange]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    fetchGlobalData();
    const timer = setInterval(() => {
      fetchGlobalData();
    }, 60_000);
    return () => clearInterval(timer);
  }, [fetchGlobalData]);

  // ciclos
  useEffect(() => {
    fetch('/api/cycles')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCycles(list);
        if (list.length > 0) {
          const current = list.find((c: any) => c.isCurrent) || list[0];
          const initialId = getCycleId(current);
          if (initialId) {
            setSelectedCycleId(initialId);
          }
        }
      })
      .catch(err => console.error('Error cargando ciclos:', err));
  }, []);

  useEffect(() => {
    if (!selectedCycleId) return;
    let cancelled = false;

    const loadCycle = async () => {
      try {
        // If the selected cycle is the current one, use /api/cycle/latest to get freshest data
        const currentCycle = cycles.find((c: any) => c.isCurrent);
        const selectedIsCurrent = currentCycle && getCycleId(currentCycle) === selectedCycleId;
        const endpoint = selectedIsCurrent ? '/api/cycle/latest' : `/api/cycle/${selectedCycleId}`;

        const res = await fetch(endpoint);
        if (!res.ok) {
          if (res.status === 404) {
            console.warn('El ciclo seleccionado ya no existe, reseteando selección');
            if (!cancelled) {
              setCycleData(null);
              setSelectedCycleId('');
              localStorage.removeItem('selectedCycleId');

              if (cycles.length > 0) {
                const first = cycles[0];
                const firstId = getCycleId(first);
                if (firstId) {
                  setSelectedCycleId(firstId);
                  localStorage.setItem('selectedCycleId', String(firstId));
                }
              }
            }
          } else {
            console.error('Error cargando ciclo:', res.status);
            if (!cancelled) setCycleData(null);
          }
          return;
        }

        const data = await res.json();

        // Normalize response: some endpoints return { cycle: {...} } while others return cycle directly
        const normalized = data && data.cycle ? data.cycle : data;

        if (!cancelled) {
          // Debug: compare previous and new points to detect incoming updates
          try {
            const prevLen = cycleData?.points?.length ?? 0;
            const newLen = normalized?.points?.length ?? 0;
            const prevLast = prevLen ? cycleData.points[prevLen - 1]?.timestamp : null;
            const newLast = newLen ? normalized.points[newLen - 1]?.timestamp : null;
            if (newLen > prevLen || newLast !== prevLast) {
              console.debug('[DEBUG][CyclePoll] endpoint', endpoint, 'selected', selectedCycleId, 'prevLen', prevLen, 'newLen', newLen, 'newLast', newLast);
            }
          } catch (e) {
            // ignore debug failures
          }

          setCycleData(normalized);
        }
      } catch (err) {
        console.error('Error cargando ciclo:', err);
        if (!cancelled) setCycleData(null);
      }
    };

    // Initial load
    loadCycle();

    // Poll while the selected cycle is active (no end) or for a short period to pick updates
    const interval = setInterval(() => {
      // If we've been cancelled, skip
      if (cancelled) return;
      loadCycle();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedCycleId, cycles]);

  const cycleChartData = useMemo(() => {
    if (!cycleData?.points?.length) return [];

    // Normalize possible field names coming from different endpoints
    let previousAccum: number | null = null;
    return cycleData.points.map((point: any, index: number) => {
      const timestamp = point.timestamp ?? point.time ?? null;

      const avgSerpentin = point.promedioSerpentin ?? point.avgSerpentin ?? point.avg_serpentin ?? null;
      const avgPuerta = point.promedioPuerta ?? point.avgPuerta ?? point.avgDoor ?? null;
      const operacion = point.operacion ?? point.operationState ?? point.operation ?? null;

      // energy accumulated may be named differently depending on endpoint
      const rawAccum = point.energiaAcumulada ?? point.energyAccumulated ?? point.energyAccumulatedTotal ?? point.energy_accumulated ?? null;
      const accumulated = typeof rawAccum === 'number' ? rawAccum : (rawAccum ? Number(rawAccum) : null);

      let delta: number | null = null;
      if (accumulated === null || Number.isNaN(accumulated)) {
        delta = null;
      } else {
        if (previousAccum === null) {
          delta = accumulated;
        } else {
          delta = Math.max(0, accumulated - previousAccum);
        }
        previousAccum = accumulated;
      }

      return {
        timestamp,
        [sanitizeKey('Promedio_Serpentin')]: typeof avgSerpentin === 'number' ? avgSerpentin : null,
        [sanitizeKey('Promedio_Puerta')]: typeof avgPuerta === 'number' ? avgPuerta : null,
        [sanitizeKey('Operacion')]: typeof operacion === 'number' ? operacion : null,
        [sanitizeKey('Energia')]: typeof delta === 'number' ? delta : null,
        energyAccumulated: typeof accumulated === 'number' ? accumulated : null, // Pass directly for GlobalChart
      };
    });
  }, [cycleData]);

  // fusionar crudos + derivados en un solo dataset
  // [WALKTHROUGH] mergedGlobalData: construye el dataset base para el gráfico superior (global)
  // Fuente: globalData (crudos) + derivedValues (derivados)
  // Para Energía Acumulada [kWh], se debe usar la métrica derivada 'Energia' y acumular en frontend
  const mergedGlobalData = useMemo(() => {
    if (!globalData.length) return [];

    const startTime = Math.min(range.start.getTime(), range.end.getTime());

    // Acumular la energía derivada
    let energiaAcc = 0;
    // Buscar los puntos de Energia derivados
    const energiaPoints = derivedValues['Energia']?.points || [];
    const energiaAccumSeries: Record<string, any>[] = energiaPoints.map(p => {
      energiaAcc += p.value ?? 0;
      return {
        timestamp: p.timestamp,
        energyAccumulated: energiaAcc,
      };
    });

    // Mapear los datos globales y fusionar con la serie acumulada
    const trackers = Object.values(derivedValues).map(entry => ({
      name: entry.name,
      key: sanitizeKey(entry.name),
      points: [...entry.points].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
      index: 0,
      lastValue: undefined as number | undefined,
    }));

    // [WALKTHROUGH] Para cada punto global, se busca el valor acumulado de energía más cercano
    return globalData.map(point => {
      const pointTime = new Date(point.timestamp).getTime();
      const mergedPoint: Record<string, any> = { ...point };

      // horas desde el inicio del rango
      const hoursSinceStart = (pointTime - startTime) / (1000 * 60 * 60);
      mergedPoint.hourFromRange = Number.isFinite(hoursSinceStart)
        ? Math.max(0, Math.round(hoursSinceStart))
        : 0;

      // series derivadas (incluye Estado de Operacion)
      trackers.forEach(tracker => {
        while (
          tracker.index < tracker.points.length &&
          new Date(tracker.points[tracker.index].timestamp).getTime() <=
          pointTime
        ) {
          tracker.lastValue = tracker.points[tracker.index].value;
          tracker.index += 1;
        }
        if (tracker.lastValue !== undefined) {
          mergedPoint[tracker.key] = tracker.lastValue;
        }
      });

      // [WALKTHROUGH] Energía acumulada: buscar el valor acumulado más cercano por timestamp
      const energiaAccum = energiaAccumSeries.findLast(e => new Date(e.timestamp).getTime() <= pointTime);
      mergedPoint.energyAccumulated = energiaAccum ? energiaAccum.energyAccumulated : null;

      return mergedPoint;
    });
  }, [globalData, derivedValues, range.start, range.end]);

  // Calculate per-cycle energy for global chart
  // [WALKTHROUGH] mergedGlobalWithCycleEnergy: dataset final para el gráfico superior
  // Fuente: mergedGlobalData, que ya tiene energyAccumulated acumulada correctamente
  // Si hay ciclos, se puede ajustar por ciclo, pero la energía acumulada ya está bien
  const mergedGlobalWithCycleEnergy = useMemo<any[]>(() => {
    // [DEBUG] Muestra los primeros 5 puntos para depuración
    console.log('[DEBUG][GlobalEnergy] sample', mergedGlobalData.slice(0, 5));

    if (!mergedGlobalData.length) return [];

    // Si no hay ciclos, no acumulamos por ciclo: dejar energyAccumulated tal como venga
    if (!cycles.length) {
      return mergedGlobalData;
    }

    // Acumular por ciclo: resetear acumulador al inicio de cada ciclo
    const sortedCycles = [...cycles].sort((a, b) => new Date(a.startReal).getTime() - new Date(b.startReal).getTime());
    let currentCycleIndex = 0;
    let cycleAccumulator = 0;
    let lastCycleId: string | null = null;

    return mergedGlobalData.map(point => {
      const pointTime = new Date(point.timestamp).getTime();
      const enhancedPoint: Record<string, any> = { ...point };

      // Advance cycle index if needed
      while (currentCycleIndex < sortedCycles.length && sortedCycles[currentCycleIndex].endReal && new Date(sortedCycles[currentCycleIndex].endReal).getTime() < pointTime) {
        currentCycleIndex++;
      }

      const cycle = sortedCycles[currentCycleIndex];
      const inCycle = cycle && pointTime >= new Date(cycle.startReal).getTime() && (!cycle.endReal || pointTime <= new Date(cycle.endReal).getTime());

      const delta = Number(point[sanitizeKey('Energia')] ?? 0);

      if (inCycle) {
        if (cycle.id !== lastCycleId) {
          cycleAccumulator = 0;
          lastCycleId = cycle.id;
        }
        cycleAccumulator += delta;
        enhancedPoint.energyAccumulated = cycleAccumulator;
      } else {
        // Fuera de ciclo dejamos null para que no se interprete como acumulado global
        cycleAccumulator = 0;
        lastCycleId = null;
        enhancedPoint.energyAccumulated = null;
      }

      return enhancedPoint;
    });
  }, [mergedGlobalData, cycles]);

  // descarga visión general
  const handleDownloadGlobal = useCallback(() => {
    if (!mergedGlobalWithCycleEnergy.length) return;
    const data = mergedGlobalWithCycleEnergy.map(point => {
      const parsedTimestamp = new Date(point.timestamp);
      const safeTimestamp = Number.isNaN(parsedTimestamp.getTime())
        ? ''
        : format(parsedTimestamp, 'dd/MM/yyyy HH:mm:ss');
      // Orden y nombres de columnas
      return {
        timestamp: safeTimestamp,
        'T. Promedio Serpentín [ºC]': typeof point[sanitizeKey('Promedio_Serpentin')] === 'number' ? point[sanitizeKey('Promedio_Serpentin')] : null,
        'T. Promedio Puerta [ºC]': typeof point[sanitizeKey('Promedio_Puerta')] === 'number' ? point[sanitizeKey('Promedio_Puerta')] : null,
        'Estado de Operación': typeof point[sanitizeKey('Operacion')] === 'number' ? point[sanitizeKey('Operacion')] : null,
        'Energía Acumulada [kWh]': typeof point.energyAccumulated === 'number' ? point.energyAccumulated : null,
      };
    });
    const sheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, 'Vision General');
    writeFile(workbook, 'vision-general.xlsx');
  }, [mergedGlobalWithCycleEnergy]);

  // descarga ciclo
  const handleDownloadCycle = useCallback(() => {
    if (!cycleData?.points?.length) return;
    const rows = cycleData.points.map((point: any) => {
      const parsedTimestamp = new Date(point.timestamp);
      const safeTimestamp = Number.isNaN(parsedTimestamp.getTime())
        ? ''
        : format(parsedTimestamp, 'dd/MM/yyyy HH:mm:ss');
      return {
        timestamp: safeTimestamp,
        'T. Promedio Serpentín [ºC]': point.promedioSerpentin,
        'T. Promedio Puerta [ºC]': point.promedioPuerta,
        'Estado de Operación': point.operacion,
        'Energía Acumulada [kWh]': point.energiaAcumulada,
      };
    });
    const sheet = utils.json_to_sheet(rows);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, 'Detalle Ciclo');
    writeFile(workbook, 'detalle-ciclo.xlsx');
  }, [cycleData]);

  const cycleEnergyTotal = useMemo(() => {
    if (!cycleData) return null;

    // Prefer aggregate value stored on cycle if present
    const totalFromCycle =
      cycleData.energyAccumulatedTotal ?? cycleData.energyAccumulated ?? cycleData.energyAccumulatedTotal ?? null;
    if (typeof totalFromCycle === 'number' && Number.isFinite(totalFromCycle)) {
      return Number(totalFromCycle);
    }

    // Fallback: look at last point in cycle and check multiple possible field names
    const points = Array.isArray(cycleData.points) ? cycleData.points : [];
    if (!points.length) return null;
    const last = points[points.length - 1];
    const raw = last?.energiaAcumulada ?? last?.energyAccumulated ?? last?.energy_accumulated ?? last?.energyAccumulatedTotal ?? null;
    const parsed = raw == null ? null : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [cycleData]);

  // ---------- render ----------

  if (!isClient) {
    return null;
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Global Chart */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <div className="flex flex-col gap-2 px-4 pb-2 shrink-0 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <UiLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                Inicio
              </UiLabel>
              <Input
                type="datetime-local"
                value={formatInputValue(range.start)}
                onChange={(e) => {
                  const val = new Date(e.target.value);
                  handleRangeSelect('start', val);
                }}
                className="w-[240px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <UiLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                Término
              </UiLabel>
              <Input
                type="datetime-local"
                value={formatInputValue(range.end)}
                onChange={(e) => {
                  const val = new Date(e.target.value);
                  handleRangeSelect('end', val);
                }}
                className="w-[240px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select onValueChange={(val) => setQuickRange(Number(val))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Rango" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1h</SelectItem>
                  <SelectItem value="12">12h</SelectItem>
                  <SelectItem value="24">24h</SelectItem>
                  <SelectItem value="48">2d</SelectItem>
                  <SelectItem value="168">7d</SelectItem>
                  <SelectItem value="720">30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadGlobal}
              className="ml-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar XLSX
            </Button>
          </div>
          {rangeError && (
            <div className="text-sm text-red-500 font-medium">
              {rangeError}
            </div>
          )}
        </div>
        <CardContent className="flex-1 min-h-0 relative p-2">
          <div className="absolute inset-0 w-full h-full">
            {loadingGlobal ? (
              <div className="flex h-full items-center justify-center">
                Cargando datos...
              </div>
            ) : mergedGlobalWithCycleEnergy.length ? (
              <GlobalChart data={mergedGlobalWithCycleEnergy} setPoint={cycleData?.setPoint} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No hay datos en el rango seleccionado
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cycle Specific Chart */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Detalle de Ciclo</CardTitle>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              value={selectedCycleId}
              onValueChange={setSelectedCycleId}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Seleccionar ciclo" />
              </SelectTrigger>
              <SelectContent>
                {cycles.map(cycle => {
                  const label = `Ciclo ${cycle.displayIndex || cycle.id} - ${safeFormatDate(
                    cycle.startReal,
                    'dd/MM HH:mm',
                  )}`;
                  const val = getCycleId(cycle);
                  return (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCycle}
              disabled={!cycleData?.points?.length}
              className="ml-2"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar XLSX
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col p-4 gap-4">
          {cycleData ? (
            <>
              <div className="flex flex-col md:flex-row gap-2 w-full">
                {/* Left: metric cards (stacked) */}
                <div className="md:w-1/3 lg:w-1/4 flex-shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Row 1 */}
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Inicio Real</div>
                      <div className="text-base font-bold text-blue-900">{safeFormatDate(cycleData.start, 'dd/MM/yyyy HH:mm', { locale: es }) || '—'}</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Fin Real</div>
                      <div className="text-base font-bold text-blue-900">{cycleData.end ? safeFormatDate(cycleData.end, 'dd/MM/yyyy HH:mm', { locale: es }) : 'En curso'}</div>
                    </div>

                    {/* Row 2 */}
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Descarga</div>
                      <div className="text-base font-bold text-blue-900">{cycleData.isCurrent ? '—' : (safeFormatDate(cycleData.dischargeTime, 'dd/MM/yyyy HH:mm', { locale: es }) || '—')}</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Fin Estimado</div>
                      <div className="text-base font-bold text-blue-900">{cycleData.endEstimated ? safeFormatDate(cycleData.endEstimated, 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}</div>
                    </div>

                    {/* Row 3 */}
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Duración Real</div>
                      <div className="text-base font-bold text-blue-900">{(typeof cycleData.durationHours === 'number' && cycleData.durationHours > 0) ? `${cycleData.durationHours.toFixed(2)} h` : '—'}</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Duración Estimada</div>
                      <div className="text-base font-bold text-blue-900">{(cycleData.start && cycleData.endEstimated) ? (() => { const hours = (new Date(cycleData.endEstimated).getTime() - new Date(cycleData.start).getTime()) / (1000 * 3600); return hours > 0 ? `${hours.toFixed(2)} h` : '—'; })() : '—'}</div>
                    </div>

                    {/* Row 4 */}
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Energía Acumulada</div>
                      <div className="text-base font-bold text-blue-900">{cycleEnergyTotal != null ? `${cycleEnergyTotal.toFixed(2)} kWh` : '—'}</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2 w-full">
                      <div className="text-xs text-blue-600 font-medium">Sobrecongelamiento</div>
                      <div className="text-base font-bold text-blue-900">{(cycleData.energyAccumulatedTotal !== undefined && cycleData.setPoint) ? (() => { const excess = Math.max(0, cycleData.energyAccumulatedTotal - cycleData.setPoint); return excess > 0 ? `${excess.toFixed(2)} kWh` : '—'; })() : '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Right: chart area */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {cycleChartData.length ? (
                    (() => {
                      const startTs = cycleChartData.length ? new Date(cycleChartData[0].timestamp).getTime() : undefined;
                      const lastPointTs = cycleChartData.length ? new Date(cycleChartData[cycleChartData.length - 1].timestamp).getTime() : undefined;
                      const endTs = lastPointTs ?? (cycleData?.endReal ? new Date(cycleData.endReal).getTime() : (cycleData?.end ? new Date(cycleData.end).getTime() : Date.now()));
                      return (
                        <div className="w-full h-80">
                          <GlobalChart
                            data={cycleChartData}
                            setPoint={cycleData.setPoint}
                            startTimestamp={startTs}
                            endTimestamp={endTs}
                          />
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      No hay datos para graficar.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-slate-500">
              Seleccione un ciclo para ver el detalle
            </div>
          )}
        </CardContent>
      </Card>
    </div >
  );
}
