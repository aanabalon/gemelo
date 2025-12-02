'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { CycleLogicConfigDTO } from '@/types/cycleLogic';

type LogicConfigForm = { [K in keyof CycleLogicConfigDTO]: number | '' };

type LogicField = {
    key: keyof CycleLogicConfigDTO;
    label: string;
    min?: number;
    step?: number | string;
};

const logicFields: LogicField[] = [
    { key: 'minRiseDegrees', label: 'Aumento mínimo (°C)' },
    { key: 'riseWindowMinutes', label: 'Ventana de aumento (min)' },
    { key: 'minSlope', label: 'Pendiente mínima (°C/min)' },
    { key: 'slopeDurationMinutes', label: 'Duración pendiente (min)' },
    { key: 'minDefrostTemperature', label: 'Temp. mínima defrost (°C)' },
    { key: 'minDefrostSeparationMinutes', label: 'Separación mínima descargas (min)' },
    { key: 'minCycleHours', label: 'Duración mínima ciclo (hrs)' },
    { key: 'maxCycleHours', label: 'Duración máxima ciclo (hrs)' },
    { key: 'operationStartValue', label: 'Valor inicio Operación' },
    { key: 'operationEndValue', label: 'Valor fin Operación' },
    { key: 'cycleEnergySetPoint', label: 'Set point energético (kWh)' },
    {
        key: 'minOperationZeroMinutesForEndReal',
        label: 'Minutos con operación = 0 para marcar Fin Real',
        min: 1,
        step: 1,
    },
];

const normalizeConfig = (config: CycleLogicConfigDTO): LogicConfigForm =>
    logicFields.reduce((acc, field) => {
        acc[field.key] = typeof config[field.key] === 'number' ? config[field.key] : '';
        return acc;
    }, {} as LogicConfigForm);

export function CycleLogicClient() {
    const [processing, setProcessing] = useState(false);
    const [logicConfig, setLogicConfig] = useState<LogicConfigForm | null>(null);
    const [savingLogic, setSavingLogic] = useState(false);

    useEffect(() => {
        fetch('/api/cycle-logic')
            .then(res => res.json())
            .then((data: CycleLogicConfigDTO) => setLogicConfig(normalizeConfig(data)))
            .catch((error) => {
                console.error('No se pudo cargar la configuración de ciclos', error);
            });
    }, []);

    const handleRecalculate = async () => {
        if (!confirm('¿Estás seguro de recalcular todos los ciclos? Esto puede tomar tiempo.')) return;

        setProcessing(true);
        try {
            const res = await fetch('/api/recalculate-cycles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (res.ok) {
                toast.success('Procesamiento completado');
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('cycles-recalculated'));
                }
            } else {
                toast.error('Error al procesar');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error de conexión');
        } finally {
            setProcessing(false);
        }
    };

    const handleLogicInput =
        (field: keyof CycleLogicConfigDTO) =>
            (event: React.ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value === '' ? '' : Number(event.target.value);
                setLogicConfig((prev) => ({
                    ...(prev ?? ({} as LogicConfigForm)),
                    [field]: value,
                }));
            };

    const handleLogicSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!logicConfig) return;

        for (const field of logicFields) {
            const raw = logicConfig[field.key];
            if (raw === '' || Number.isNaN(Number(raw))) {
                toast.error('Todos los campos son obligatorios.');
                setSavingLogic(false);
                return;
            }
            if (field.key === 'minOperationZeroMinutesForEndReal' && Number(raw) < 1) {
                toast.error('El valor de minutos con operación = 0 debe ser mayor o igual a 1.');
                setSavingLogic(false);
                return;
            }
        }

        setSavingLogic(true);
        try {
            const payload = Object.fromEntries(
                Object.entries(logicConfig).map(([key, value]) => [key, Number(value)])
            );
            const response = await fetch('/api/cycle-logic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                toast.error('No se pudo guardar la configuración');
                return;
            }
            const saved = (await response.json()) as CycleLogicConfigDTO;
            setLogicConfig(normalizeConfig(saved));
            toast.success('Configuración actualizada');
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar configuración');
        } finally {
            setSavingLogic(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Lógica de Ciclos</h1>
                <div className="flex space-x-2">
                    <Link href="/cycle-detail" className="inline-flex">
                        <Button variant="secondary">
                            Ver ciclo actual
                        </Button>
                    </Link>
                    <Button variant="outline" onClick={handleRecalculate} disabled={processing}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
                        {processing ? 'Procesando...' : 'Recalcular Ciclos'}
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Parámetros de Detección</CardTitle>
                    <CardDescription>Valores usados por el motor para detectar descargas y ciclos.</CardDescription>
                </CardHeader>
                <CardContent>
                    {logicConfig ? (
                        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleLogicSave}>
                            {logicFields.map((item) => (
                                <div className="grid gap-2" key={item.key}>
                                    <Label htmlFor={item.key}>{item.label}</Label>
                                    <Input
                                        id={item.key}
                                        name={item.key}
                                        type="number"
                                        step={item.step ?? 'any'}
                                        min={item.min}
                                        value={
                                            logicConfig[item.key] === ''
                                                ? ''
                                                : String(logicConfig[item.key])
                                        }
                                        onChange={handleLogicInput(item.key)}
                                        required
                                    />
                                </div>
                            ))}
                            <div className="md:col-span-2 flex justify-end">
                                <Button type="submit" disabled={savingLogic}>
                                    {savingLogic ? 'Guardando...' : 'Guardar Configuración'}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No se pudo cargar la configuración actual.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
