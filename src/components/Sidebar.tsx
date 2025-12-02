'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Zap, Settings, LogOut, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SidebarProps {
    role?: string;
}

export function Sidebar({ role }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
    };

    const links = [
        { href: '/dashboard', label: 'Tunel 9', icon: LayoutDashboard, roles: ['READER', 'ADMIN'] },
        { href: '/energy-config', label: 'Config Energía', icon: Zap, roles: ['ADMIN'] },
        { href: '/cycle-logic', label: 'Lógica Ciclos', icon: Settings, roles: ['ADMIN'] },
        { href: '/notifications', label: 'Alertas', icon: Bell, roles: ['ADMIN'] },
    ];

    return (
        <div className={cn(
            "flex h-screen flex-col border-r bg-card transition-all duration-300",
            isCollapsed ? "w-16" : "w-64"
        )}>
            <div className="border-b px-4 py-4 relative">
                {!isCollapsed && (
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
                            <Image src="/logo.png" alt="Gemelo Landes" width={36} height={36} className="object-contain" />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold">Gemelo Landes</h1>
                            <p className="text-xs text-muted-foreground">Ciclos de Congelado</p>
                        </div>
                    </div>
                )}
                {isCollapsed && (
                    <div className="flex justify-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
                            <Image src="/logo.png" alt="Gemelo Landes" width={36} height={36} className="object-contain" />
                        </div>
                    </div>
                )}

                {/* Collapse/Expand button */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border bg-background p-0 shadow-md hover:bg-accent"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                    ) : (
                        <ChevronLeft className="h-4 w-4" />
                    )}
                </Button>
            </div>

            <nav className="flex-1 space-y-1 p-4">
                {!isCollapsed && (
                    <div className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Navegación
                    </div>
                )}
                {links.map((link) => {
                    if (!link.roles.includes(role || 'READER')) return null;

                    const Icon = link.icon;
                    const isActive = pathname === link.href;

                    return (
                        <Link key={link.href} href={link.href}>
                            <div
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    isCollapsed && "justify-center"
                                )}
                                title={isCollapsed ? link.label : undefined}
                            >
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                {!isCollapsed && link.label}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t p-4">
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                        isCollapsed ? "justify-center px-0" : "justify-start"
                    )}
                    onClick={handleLogout}
                    title={isCollapsed ? "Cerrar Sesión" : undefined}
                >
                    <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                    {!isCollapsed && "Cerrar Sesión"}
                </Button>
            </div>
        </div>
    );
}
