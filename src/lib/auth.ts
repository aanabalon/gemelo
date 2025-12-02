import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const ALG = 'HS256';
const TOKEN_TTL = '24h';
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? 'supersecret');

export interface SessionPayload extends JWTPayload {
  id: string;
  email: string;
  role: string;
}

export async function signToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: [ALG] });
    if (
      typeof payload.id === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.role === 'string'
    ) {
      return payload as SessionPayload;
    }
    return null;
  } catch {
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

export async function login(user: { id: string; email: string; role: string }) {
  const token = await signToken({ ...user });
  (await cookies()).set('session', token, { httpOnly: true, path: '/' });
}

export async function logout() {
  (await cookies()).delete('session');
}
