'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  role?: string | null;
  children: React.ReactNode;
}

export default function AdminGuard({ role, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;

    const isAdminPath = pathname.startsWith('/energy-config') || pathname.startsWith('/cycle-logic');
    if (isAdminPath && role !== 'ADMIN') {
      // Redirect non-admin users to dashboard
      router.replace('/dashboard');
    }
  }, [pathname, role, router]);

  return <>{children}</>;
}
