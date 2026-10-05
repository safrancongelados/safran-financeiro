import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export const COOKIE_NAME = "safran_fin_session";
const DURACAO = 60 * 60 * 24 * 30; // 30 dias
const AUDIENCIA = "financeiro";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurada");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  nome: string;
  email: string;
}

export async function hashPassword(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUDIENCIA)
    .setExpirationTime(`${DURACAO}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO,
  });
}

export async function encerrarSessao() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function obterSessao(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCIA });
    return { userId: payload.userId as string, nome: payload.nome as string, email: payload.email as string };
  } catch {
    return null;
  }
}

/** Usada pelo proxy. */
export async function verificarToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret(), { audience: AUDIENCIA });
    return true;
  } catch {
    return false;
  }
}
