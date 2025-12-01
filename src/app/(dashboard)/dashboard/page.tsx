import { getSession } from '@/lib/auth';

import DashboardPageClient from './DashboardPageClient';

export default async function DashboardPage() {
    const session = await getSession();

    return (
        <div className="flex flex-col h-screen gap-4">
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tunel 9</h1>
                <div className="text-sm text-slate-500">
                    Bienvenido, {String(session?.email || 'Usuario')}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <DashboardPageClient />
            </div>
        </div>
    );
}
