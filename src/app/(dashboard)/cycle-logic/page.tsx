import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CycleLogicClient } from './CycleLogicClient';

export default async function CycleLogicPage() {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    if (session.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    return <CycleLogicClient />;
}
