import nodemailer from 'nodemailer';

interface MailOptions {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

let transporterPromise: Promise<MailTransporter | null> | null = null;

function buildTransporter(): MailTransporter | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '[Notifications] SMTP configuration is incomplete. Skipping e-mail delivery.'
    );
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: Boolean(process.env.SMTP_SECURE === 'true' || port === 465),
    auth: { user, pass },
  });
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = new Promise((resolve) => {
      const instance = buildTransporter();
      if (!instance) {
        resolve(null);
        return;
      }
      resolve(instance);
    });
  }

  return transporterPromise;
}

export async function sendNotificationEmail(options: MailOptions) {
  if (!options.to.length) {
    console.warn('[Notifications] No recipients defined, skipping email.');
    return;
  }

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[Notifications] Transporter unavailable, cannot send email.');
    return;
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'notifier@example.com';

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? `<p>${options.text}</p>`,
  });
}
