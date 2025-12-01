import { Sidebar } from '@/components/Sidebar';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    return (
        <div className="flex h-screen bg-muted/40">
            <Sidebar role={session.role as string} />
            <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-4">
                    <AdminGuard role={session.role as string}>
                        {children}
                    </AdminGuard>
                </div>
            </main>
        </div>
    );
}
