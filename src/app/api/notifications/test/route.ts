import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendNotificationEmail } from '@/lib/notifications/mailer';
import { z } from 'zod';

const payloadSchema = z.object({
  recipients: z.array(z.string().min(1)).min(1),
});

const sanitizeRecipients = (raw: string[]) =>
  raw
    .map((entry) => entry.trim())
    .filter((entry, index, self) => entry.length > 0 && self.indexOf(entry) === index);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed = payloadSchema.parse(await request.json());
    const recipients = sanitizeRecipients(parsed.recipients);
    if (!recipients.length) {
      return NextResponse.json(
        { error: 'Debes especificar al menos un destinatario válido' },
        { status: 400 }
      );
    }

    await sendNotificationEmail({
      to: recipients,
      subject: 'Prueba de notificaciones - Gemelo',
      text: [
        'Este es un correo de prueba enviado desde Gemelo para verificar la configuración SMTP.',
        'Si recibiste este mensaje, la integración de correos funciona correctamente.',
      ].join('\n'),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }
    console.error('[Notifications] Failed to send test email', error);
    return NextResponse.json(
      { error: 'No se pudo enviar el correo de prueba' },
      { status: 500 }
    );
  }
}
