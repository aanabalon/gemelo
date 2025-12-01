import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EnergyConfigClient } from './EnergyConfigClient';

export default async function EnergyConfigPage() {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    if (session.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    return <EnergyConfigClient />;
}
