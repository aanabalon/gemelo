import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CycleDetailClient } from './CycleDetailClient';

export default async function CycleDetailPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return <CycleDetailClient />;
}
