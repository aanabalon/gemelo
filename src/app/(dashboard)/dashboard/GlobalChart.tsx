'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  TimeScale,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

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

const sanitizeKey = (name: string) =>
  `derived_${name.replace(/\s+/g, '_').replace(/\W/g, '')}`;

export function GlobalChart({ data, setPoint, startTimestamp, endTimestamp }: { data: Record<string, any>[]; setPoint?: number; startTimestamp?: number; endTimestamp?: number }) {
  const chartRef = useRef<any>(null);

  useEffect(() => {
    import('chartjs-plugin-zoom').then((mod) => {
      ChartJS.register(mod.default);
    });
  }, []);

  // Force chart resize when container changes (e.g., sidebar collapse/expand)
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    // Also trigger resize on mount and when data changes
    const timer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [data]);

  // --------------------------------------
  // ENERGÍA ACUMULADA
  // --------------------------------------
  const energiaAcumulada = useMemo(() => {
    // Usar siempre el campo energyAccumulated si existe, igual que el gráfico inferior
    return data.map((point) => ({
      x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
      y: typeof point.energyAccumulated === 'number' ? point.energyAccumulated : null,
    }));
  }, [data]);

  const firstTimestampData = data.length ? new Date(data[0].timestamp).getTime() : null;
  const lastTimestampData = data.length ? new Date(data[data.length - 1].timestamp).getTime() : null;
  const firstTimestamp = typeof startTimestamp === 'number' ? startTimestamp : firstTimestampData;
  const lastTimestamp = typeof endTimestamp === 'number' ? endTimestamp : lastTimestampData;

  // --------------------------------------
  // DATASETS
  // --------------------------------------
  const chartData = useMemo(
    () => ({
      datasets: [
        {
          label: 'T. Promedio Serpentín [ºC]',
          borderColor: '#1D4ED8',
          backgroundColor: '#1D4ED8',
          data: data.map((point) => ({
            x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
            y: Number(point[sanitizeKey('Promedio_Serpentin')] ?? null),
          })),
          yAxisID: 'temp',
          xAxisID: 'x',
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'T. Promedio Puerta [ºC]',
          borderColor: '#60A5FA',
          backgroundColor: '#60A5FA',
          data: data.map((point) => ({
            x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
            y: Number(point[sanitizeKey('Promedio_Puerta')] ?? null),
          })),
          yAxisID: 'temp',
          xAxisID: 'x',
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Estado de Operación',
          borderColor: '#f97316',
          stepped: true,
          data: data.map((point) => ({
            x: typeof point.timestamp === 'string' ? new Date(point.timestamp).getTime() : point.timestamp,
            y: Number(point[sanitizeKey('Operacion')] ?? null),
          })),
          yAxisID: 'state',
          xAxisID: 'x',
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Energía Acumulada [kWh]',
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.25)',
          fill: true,
          data: energiaAcumulada,
          yAxisID: 'energy',
          xAxisID: 'x',
          pointRadius: 0,
          borderWidth: 2,
        },
        ...(setPoint
          ? [
            {
              label: 'Set Point Energia [kWh]',
              borderColor: '#ef4444',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 2,
              data: data.map((p) => ({ x: typeof p.timestamp === 'string' ? new Date(p.timestamp).getTime() : p.timestamp, y: setPoint })),
              yAxisID: 'energy',
              fill: false,
            },
          ]
          : []),
      ] as any[],
    }),
    [data, energiaAcumulada, setPoint]
  );

  // --------------------------------------
  // OPTIONS
  // --------------------------------------
  const options = useMemo(
    () => ({
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { position: 'bottom' as const },
        // Zoom / pan plugin configuration: enable drag-to-zoom (box selection), wheel and pinch zoom, and pan with Ctrl+drag
        zoom: {
          pan: {
            enabled: true,
            mode: 'x' as const,
            modifierKey: 'ctrl' as const,   // ⬅️ cambio
          },
          zoom: {
            wheel: {
              enabled: false,
            },
            pinch: {
              enabled: true,
            },
            drag: {
              enabled: true,
              borderColor: 'rgba(0,0,0,0.5)',
              backgroundColor: 'rgba(0,0,0,0.08)',
            },
            mode: 'x' as const,
          },
        },
      },

      scales: {
        // EJE X PRINCIPAL → timestamp
        x: {
          type: 'time' as const,
          time: { tooltipFormat: 'dd/MM HH:mm:ss' },
          position: 'bottom' as const,
          ticks: {
            callback: function (value: number | string) {
              const dateValue =
                typeof value === 'number'
                  ? value
                  : new Date(value as string).getTime();
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
          time: {
            unit: 'hour' as const,
          },
          min: firstTimestamp ?? undefined,
          max: lastTimestamp ?? undefined,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 15,
            callback: function (value: number | string) {
              if (!data.length || firstTimestamp === null) return '';
              const numericValue =
                typeof value === 'number'
                  ? value
                  : new Date(value as string).getTime();
              if (!Number.isFinite(numericValue)) return '';
              const hours = (numericValue - firstTimestamp) / 3600000;
              if (hours < 0 || !Number.isFinite(hours)) return '';
              return Math.floor(hours);
            },
          },
        },

        temp: {
          type: 'linear' as const,
          position: 'left' as const,
          title: { display: true, text: '°C' },
        },

        state: {
          type: 'linear' as const,
          position: 'right' as const,
          // Keep the plotted range slightly beyond 0..1 so lines/points render fully,
          // but display only 0 and 1 as tick labels.
          min: -0.01,
          max: 1.01,
          ticks: {
            stepSize: 1,
            callback: function (value: number | string) {
              const numeric = typeof value === 'number' ? value : Number(value);
              // Map values near the lower bound to '0' and near the upper to '1'
              return numeric < 0.5 ? '0' : '1';
            },
          },
        },

        energy: {
          type: 'linear' as const,
          position: 'right' as const,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'kWh' },
        },
      },
    }),
    [data, firstTimestamp, lastTimestamp]
  );

  const handleResetZoom = () => {
    try {
      chartRef.current?.resetZoom?.();
    } catch (e) {
      // fail silently
      // console.warn('resetZoom failed', e);
    }
  };

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-1 top-1 z-10">
        <Button aria-label="Reset zoom" size="sm" variant="ghost" onClick={handleResetZoom} className="p-1">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
      <Line ref={chartRef} data={chartData} options={options} style={{ height: '100%' }} />
    </div>
  );
}
