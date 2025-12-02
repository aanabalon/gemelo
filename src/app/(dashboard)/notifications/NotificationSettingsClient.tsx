'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type EventKey =
  | 'CYCLE_STARTED'
  | 'SETPOINT_REACHED'
  | 'CYCLE_COMPLETED'
  | 'SETPOINT_PERCENT';

interface NotificationRuleState {
  event: EventKey;
  enabled: boolean;
  recipients: string[];
  percentageThreshold?: number | null;
}

interface LocalRuleState extends NotificationRuleState {
  recipientsText: string;
  isSaving: boolean;
  isTesting: boolean;
}

const EVENT_DEFINITIONS: Record<
  EventKey,
  { title: string; description: string; requiresPercentage?: boolean; helper?: string }
> = {
  CYCLE_STARTED: {
    title: 'Inicio de ciclo',
    description: 'Envía un correo apenas detectamos que comenzó un nuevo ciclo.',
  },
  SETPOINT_REACHED: {
    title: 'Set point alcanzado',
    description: 'Se notifica al alcanzar el set point energético configurado.',
  },
  CYCLE_COMPLETED: {
    title: 'Ciclo completado',
    description: 'Aviso cuando el ciclo finaliza y queda guardado en la base.',
  },
  SETPOINT_PERCENT: {
    title: 'Porcentaje de set point',
    description: 'Envía un correo al alcanzar un porcentaje configurable del set point.',
    requiresPercentage: true,
    helper: 'Ejemplo: 110 envía alerta cuando se supera el 110% del set point.',
  },
};

const ORDERED_EVENTS: EventKey[] = [
  'CYCLE_STARTED',
  'SETPOINT_REACHED',
  'SETPOINT_PERCENT',
  'CYCLE_COMPLETED',
];

const buildInitialState = (): Record<EventKey, LocalRuleState> =>
  ORDERED_EVENTS.reduce(
    (acc, event) => ({
      ...acc,
      [event]: {
        event,
        enabled: false,
        recipients: [],
        recipientsText: '',
        percentageThreshold: event === 'SETPOINT_PERCENT' ? 120 : null,
        isSaving: false,
        isTesting: false,
      },
    }),
    {} as Record<EventKey, LocalRuleState>
  );

const splitRecipients = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry, index, self) => entry.length > 0 && self.indexOf(entry) === index);

export function NotificationSettingsClient() {
  const [rules, setRules] = useState<Record<EventKey, LocalRuleState>>(buildInitialState);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/settings');
      if (!res.ok) throw new Error('fail');
      const data: NotificationRuleState[] = await res.json();
      setRules((prev) => {
        const next = { ...prev };
        data.forEach((rule) => {
          next[rule.event] = {
            ...next[rule.event],
            ...rule,
            recipientsText: (rule.recipients ?? []).join(', '),
            percentageThreshold: rule.percentageThreshold ?? next[rule.event]?.percentageThreshold ?? null,
            isSaving: false,
            isTesting: false,
          };
        });
        return next;
      });
    } catch (error) {
      console.error('No se pudieron cargar las reglas de notificación', error);
      toast.error('No se pudieron cargar las reglas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleToggle = (event: EventKey, enabled: boolean) => {
    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], enabled },
    }));
  };

  const handleRecipientsChange = (event: EventKey, value: string) => {
    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], recipientsText: value },
    }));
  };

  const handlePercentageChange = (event: EventKey, value: number | null) => {
    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], percentageThreshold: value },
    }));
  };

  const handleSave = async (event: EventKey) => {
    const current = rules[event];
    if (!current) return;

    const recipients = splitRecipients(current.recipientsText);
    if (current.enabled && recipients.length === 0) {
      toast.error('Debes ingresar al menos un destinatario para habilitar la alerta.');
      return;
    }

    if (
      current.enabled &&
      EVENT_DEFINITIONS[event].requiresPercentage &&
      (!current.percentageThreshold || current.percentageThreshold <= 0)
    ) {
      toast.error('Ingresa un porcentaje válido mayor a 0.');
      return;
    }

    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], isSaving: true },
    }));

    try {
      const payload: {
        event: EventKey;
        enabled: boolean;
        recipients: string[];
        percentageThreshold?: number;
      } = {
        event,
        enabled: current.enabled,
        recipients,
      };

      if (
        current.percentageThreshold !== null &&
        current.percentageThreshold !== undefined
      ) {
        payload.percentageThreshold = current.percentageThreshold;
      }

      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorBody = await res
          .json()
          .catch(async () => ({ error: await res.text() }));
        const message =
          typeof errorBody?.error === 'string'
            ? errorBody.error
            : 'No se pudo guardar la configuración';
        toast.error(message);
        throw new Error('save_failed');
      }

      const saved: NotificationRuleState = await res.json();
      setRules((prev) => ({
        ...prev,
        [event]: {
          ...prev[event],
          enabled: saved.enabled,
          recipients: saved.recipients,
          recipientsText: saved.recipients.join(', '),
          percentageThreshold: saved.percentageThreshold ?? null,
          isSaving: false,
        },
      }));
      toast.success('Regla actualizada');
    } catch (error) {
      if ((error as Error)?.message !== 'save_failed') {
        console.error('No se pudo guardar la configuración de notificaciones', error);
        toast.error('No se pudo guardar la configuración');
      }
      setRules((prev) => ({
        ...prev,
        [event]: { ...prev[event], isSaving: false },
      }));
    }
  };

  const handleSendTest = async (event: EventKey) => {
    const current = rules[event];
    if (!current) return;

    const recipients = splitRecipients(current.recipientsText);
    if (!recipients.length) {
      toast.error('Ingresa al menos un destinatario para enviar la prueba.');
      return;
    }

    setRules((prev) => ({
      ...prev,
      [event]: { ...prev[event], isTesting: true },
    }));

    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients }),
      });
      if (!res.ok) {
        throw new Error('test_failed');
      }
      toast.success('Correo de prueba enviado');
    } catch (error) {
      console.error('No se pudo enviar el correo de prueba', error);
      toast.error('No se pudo enviar el correo de prueba');
    } finally {
      setRules((prev) => ({
        ...prev,
        [event]: { ...prev[event], isTesting: false },
      }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Alertas por Correo
        </h1>
        <p className="text-muted-foreground">
          Define qué eventos del ciclo disparan correos automáticos y quién debe recibirlos.
          Estas alertas se envían cuando el servidor procesa nuevos ciclos.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {ORDERED_EVENTS.map((event) => {
          const definition = EVENT_DEFINITIONS[event];
          const state = rules[event];
          return (
            <Card key={event}>
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">{definition.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{definition.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${event}`}>Habilitado</Label>
                    <Switch
                      id={`toggle-${event}`}
                      checked={state?.enabled ?? false}
                      onCheckedChange={(checked) => handleToggle(event, checked)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`recipients-${event}`}>Destinatarios</Label>
                  <Textarea
                    id={`recipients-${event}`}
                    value={state?.recipientsText ?? ''}
                    placeholder="correo1@empresa.com, correo2@empresa.com"
                    onChange={(e) => handleRecipientsChange(event, e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separa correos con comas, punto y coma o saltos de línea.
                  </p>
                </div>
                {definition.requiresPercentage && (
                  <div className="space-y-2">
                    <Label htmlFor={`percent-${event}`}>Porcentaje del set point</Label>
                    <Input
                      id={`percent-${event}`}
                      type="number"
                      min={1}
                      step={1}
                      value={state?.percentageThreshold ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        handlePercentageChange(
                          event,
                          value === '' ? null : Number(value)
                        );
                      }}
                      disabled={loading}
                    />
                    {definition.helper && (
                      <p className="text-xs text-muted-foreground">{definition.helper}</p>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSendTest(event)}
                    disabled={state?.isTesting}
                  >
                    {state?.isTesting ? 'Enviando...' : 'Enviar prueba'}
                  </Button>
                  <Button onClick={() => handleSave(event)} disabled={state?.isSaving}>
                    {state?.isSaving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
