import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { NotificationSettingsClient } from './NotificationSettingsClient';

export default async function NotificationsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return <NotificationSettingsClient />;
}
