"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { criarSessao, encerrarSessao, hashPassword, obterSessao, verificarSenha } from "@/lib/auth";

export interface FormState {
  erro?: string;
  ok?: string;
}

/**
 * Só aceita voltar para um caminho interno. Sem isso, `?de=` viraria
 * redirecionamento aberto — inclusive com barra invertida: o navegador lê
 * "/\site.com" como "//site.com".
 */
function destinoSeguro(de: string | null): string {
  if (!de || !de.startsWith("/") || /^\/[\\/]/.test(de) || de.includes("\\") || de.startsWith("/login")) return "/";
  return de;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const destino = destinoSeguro(formData.get("de") ? String(formData.get("de")) : null);

  if (!email || !senha) return { erro: "Informe email e senha." };

  let usuario: typeof usuarios.$inferSelect | undefined;
  try {
    [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  } catch (err) {
    // Falha de banco no login vira mensagem na tela, não página de erro; o
    // detalhe vai para o registro da Vercel.
    console.error("[login] falha ao consultar usuários:", err);
    return { erro: "Não foi possível conectar ao banco agora. Tente de novo em instantes." };
  }
  if (!usuario || !(await verificarSenha(senha, usuario.senhaHash))) {
    return { erro: "Email ou senha incorretos." };
  }

  await criarSessao({ userId: usuario.id, nome: usuario.nome, email: usuario.email });
  redirect(destino);
}

export async function logoutAction() {
  await encerrarSessao();
  redirect("/login");
}

export async function trocarSenhaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await obterSessao();
  if (!sessao) return { erro: "Sessão expirada." };

  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  if (nova.length < 8) return { erro: "A nova senha precisa de ao menos 8 caracteres." };

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, sessao.userId)).limit(1);
  if (!usuario || !(await verificarSenha(atual, usuario.senhaHash))) return { erro: "Senha atual incorreta." };

  await db.update(usuarios).set({ senhaHash: await hashPassword(nova) }).where(eq(usuarios.id, usuario.id));
  return { ok: "Senha alterada." };
}
