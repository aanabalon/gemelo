import { NextResponse } from 'next/server';
import { comparePassword, login } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        await login(user);

        return NextResponse.json({ success: true, user: { email: user.email, role: user.role } });
    } catch {
        return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }
}
