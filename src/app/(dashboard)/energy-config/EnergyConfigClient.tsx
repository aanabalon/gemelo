'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit } from 'lucide-react';

type EnergyConfig = {
    id: string;
    name: string;
    description?: string | null;
    expression: string;
    enabled: boolean;
};

export function EnergyConfigClient() {
    const [configs, setConfigs] = useState<EnergyConfig[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<EnergyConfig | null>(null);
    const [enabledState, setEnabledState] = useState<boolean>(true);
    const [expressionValue, setExpressionValue] = useState<string>('');
    const [recomputeLoading, setRecomputeLoading] = useState(false);
    const [influxFields, setInfluxFields] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const fetchConfigs = useCallback(() => {
        fetch('/api/config/energy')
            .then(res => res.json())
            .then((data: EnergyConfig[]) => setConfigs(Array.isArray(data) ? data : []));
    }, []);

    const fetchInfluxFields = useCallback(async () => {
        try {
            const end = new Date();
            const start = new Date(end.getTime() - 60 * 60 * 1000);
            const res = await fetch(`/api/data/raw?start=${start.toISOString()}&end=${end.toISOString()}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            if (!list.length) {
                setInfluxFields([]);
                return;
            }
            const keys = Object.keys(list[0] ?? {}).filter((key) => key !== 'timestamp');
            setInfluxFields(keys.sort((a, b) => a.localeCompare(b)));
        } catch (error) {
            console.error('No se pudieron obtener campos de Influx', error);
            setInfluxFields([]);
        }
    }, []);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    useEffect(() => {
        fetchInfluxFields();
    }, [fetchInfluxFields]);

    useEffect(() => {
        // when opening the dialog to edit, populate the controlled expression
        setExpressionValue(editingConfig?.expression ?? '');
    }, [editingConfig, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            name: formData.get('name'),
            expression: expressionValue,
            description: formData.get('description'),
            enabled: enabledState,
        };

        await fetch('/api/config/energy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        setIsOpen(false);
        setEditingConfig(null);
        setEnabledState(true);
        fetchConfigs();

        try {
            const res = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recalculate: true }),
            });

            if (res.ok) {
                toast.success('Regla guardada y procesamiento disparado');
            } else {
                toast.error('Regla guardada pero el procesamiento falló');
            }
        } catch (err) {
            console.error(err);
            toast.error('No se pudo disparar el procesamiento');
        }
    };

    const openEdit = (config: EnergyConfig) => {
        setEditingConfig(config);
        setEnabledState(config?.enabled ?? true);
        setIsOpen(true);
    };

    const insertAtCursor = (text: string) => {
        const ta = textareaRef.current as HTMLTextAreaElement | null;
        if (!ta) {
            // fallback: append
            setExpressionValue((prev) => (prev ? prev + ' ' + text : text));
            return;
        }

        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        const newValue = expressionValue.slice(0, start) + text + expressionValue.slice(end);
        setExpressionValue(newValue);

        // restore focus and move cursor after inserted text
        requestAnimationFrame(() => {
            ta.focus();
            const pos = start + text.length;
            ta.selectionStart = ta.selectionEnd = pos;
        });
    };

    const handleRecompute = async () => {
        if (!editingConfig?.id) return;
        setRecomputeLoading(true);
        try {
            const res = await fetch('/api/config/energy/recompute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingConfig.id,
                    fromScratch: true,
                }),
            });

            if (!res.ok) {
                throw new Error('Recompute failed');
            }

            const displayName = editingConfig.description || editingConfig.name;
            toast.success(`Recalculo iniciado para ${displayName}`);
            fetchConfigs();
        } catch (error) {
            console.error(error);
            toast.error('No se pudo recalcular la variable');
        } finally {
            setRecomputeLoading(false);
        }
    };

    const derivedVariableOptions = useMemo(
        () =>
            configs.filter(
                (cfg: EnergyConfig) =>
                    cfg.enabled && (!editingConfig || cfg.id !== editingConfig.id)
            ),
        [configs, editingConfig]
    );

    const influxFieldOptions = useMemo(() => {
        const derivedNames = new Set(configs.map((cfg) => cfg.name));
        return influxFields.filter((field) => !derivedNames.has(field));
    }, [influxFields, configs]);

    const getDisplayName = useCallback(
        (config: EnergyConfig | null) => (config?.description ? config.description : config?.name ?? ''),
        []
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Configuración de Energía</h1>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => {
                            setEditingConfig(null);
                            setEnabledState(true);
                        }}>
                            <Plus className="mr-2 h-4 w-4" /> Nueva Variable
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {editingConfig
                                    ? `Editar ${getDisplayName(editingConfig)}`
                                    : 'Nueva Variable'}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" name="name" defaultValue={editingConfig?.name} required readOnly={!!editingConfig} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="expression">Expresión / Fórmula</Label>
                                <Textarea
                                    id="expression"
                                    name="expression"
                                    ref={textareaRef}
                                    value={expressionValue}
                                    onChange={(e) => setExpressionValue(e.target.value)}
                                    required
                                    className="font-mono"
                                />
                                <p className="text-xs text-slate-500">Ej: corriente_A * 220 / 1000</p>

                                <div className="mt-3 grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-sm font-medium mb-1">Campos Influx</div>
                                            <div className="grid gap-1 max-h-40 overflow-auto border rounded p-2 bg-white">
                                                {influxFieldOptions.map((field) => (
                                                    <button
                                                        key={field}
                                                        type="button"
                                                        className="text-xs text-left px-2 py-1 hover:bg-slate-50 rounded"
                                                        onClick={() => insertAtCursor(field)}
                                                    >
                                                        {field}
                                                    </button>
                                                ))}
                                                {influxFieldOptions.length === 0 && (
                                                    <div className="text-xs text-slate-500 px-2 py-1">
                                                        No se detectaron campos de Influx recientes
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium mb-1">Variables Derivadas Disponibles</div>
                                            <div className="grid gap-1 max-h-40 overflow-auto border rounded p-2 bg-white">
                                                {derivedVariableOptions.map((cfg) => (
                                                    <button
                                                        key={cfg.id}
                                                        type="button"
                                                        className="text-xs text-left px-2 py-1 hover:bg-slate-50 rounded"
                                                        onClick={() => insertAtCursor(cfg.name)}
                                                    >
                                                        {cfg.description || cfg.name}
                                                    </button>
                                                ))}
                                                {derivedVariableOptions.length === 0 && (
                                                    <div className="text-xs text-slate-500 px-2 py-1">
                                                        No hay variables derivadas disponibles
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-sm font-medium mb-1">Funciones / Operaciones</div>
                                        <div className="grid gap-1 max-h-40 overflow-auto border rounded p-2 bg-white">
                                            {[
                                                'avg(a, b, ...)',
                                                'sum(a, b, ...)',
                                                'iff(cond, a, b)  (alias: if)',
                                                'min(a, b)',
                                                'max(a, b)',
                                                'pow(a, b)',
                                                '+, -, *, /, ^, <, >, <=, >=, ==, !=',
                                            ].map((fn) => (
                                                <div key={fn} className="text-xs px-2 py-1">{fn}</div>
                                            ))}
                                        </div>
                                        <div className="mt-2 text-xs text-slate-500 border rounded p-2 bg-white">
                                            <div className="font-medium text-slate-600 mb-1">
                                                Funciones internas del sistema (disponibles en expresiones):
                                            </div>
                                            <div>- min_real → minutos reales entre muestras consecutivas</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Input
                                    id="description"
                                    name="description"
                                    defaultValue={editingConfig?.description ?? ''}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="enabled"
                                    name="enabled"
                                    checked={enabledState}
                                    onCheckedChange={(value: boolean) => setEnabledState(value)}
                                />
                                <Label htmlFor="enabled">Habilitado</Label>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button type="submit" className="w-full">
                                    Guardar
                                </Button>
                                {editingConfig && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        onClick={handleRecompute}
                                        disabled={recomputeLoading}
                                    >
                                        {recomputeLoading ? 'Recalculando...' : 'Recalcular desde cero'}
                                    </Button>
                                )}
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Variables Definidas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Fórmula</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {configs.map((config) => {
                                const displayName = config.description || config.name;
                                return (
                                    <TableRow key={config.id}>
                                        <TableCell className="font-medium">{displayName}</TableCell>
                                        <TableCell className="font-mono text-xs">{config.expression}</TableCell>
                                        <TableCell>{displayName}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {config.enabled ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(config)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
