import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'supersecret');
const ALG = 'HS256';

export async function signToken(payload: any) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(SECRET);
}

export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload;
    } catch (e) {
        return null;
    }
}

export async function hashPassword(password: string) {
    return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
}

export async function getSession() {
    const token = (await cookies()).get('session')?.value;
    if (!token) return null;
    return verifyToken(token);
}

export async function login(user: any) {
    const token = await signToken({ id: user.id, email: user.email, role: user.role });
    (await cookies()).set('session', token, { httpOnly: true, path: '/' });
}

export async function logout() {
    (await cookies()).delete('session');
}
