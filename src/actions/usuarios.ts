"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { papelUsuarioEnum, usuarios } from "@/db/schema";
import { registrar } from "@/lib/auditoria";
import { hashPassword } from "@/lib/auth";
import { eViolacaoDeUnicidade } from "@/lib/db-erros";
import { exigirDono } from "@/lib/permissoes";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export interface UsuarioFormState {
  erro?: string;
  ok?: string;
  /** A senha provisória, mostrada uma vez só. */
  senha?: string;
  email?: string;
}

/** Sem caracteres ambíguos (0/O, 1/l), para ditar por telefone sem erro. */
function senhaProvisoria(): string {
  const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(12), (b) => ALFABETO[b % ALFABETO.length]).join("");
}

const novoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(80, "Nome muito longo."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  papel: z.enum(papelUsuarioEnum.enumValues),
});

/** Cria um acesso com senha provisória; a pessoa troca em /senha. */
export async function criarUsuarioAction(_prev: UsuarioFormState, formData: FormData): Promise<UsuarioFormState> {
  const acesso = await exigirDono();
  if ("erro" in acesso) return { erro: acesso.erro };
  const parsed = novoSchema.safeParse({ nome: formData.get("nome") ?? "", email: formData.get("email") ?? "", papel: formData.get("papel") });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const senha = senhaProvisoria();
  let id: string;
  try {
    const [u] = await db
      .insert(usuarios)
      .values({ ...parsed.data, senhaHash: await hashPassword(senha) })
      .returning({ id: usuarios.id });
    id = u.id;
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe um acesso com esse e-mail." };
    throw err;
  }
  await registrar(acesso.sessao, { acao: "criar", alvoTipo: "usuario", alvoId: id, detalhe: { nome: parsed.data.nome, email: parsed.data.email, papel: parsed.data.papel } });
  revalidatePath("/configuracoes/usuarios");
  return { ok: `Acesso criado para ${parsed.data.nome}. Anote a senha provisória: ela não aparece de novo.`, senha, email: parsed.data.email };
}

/** Papel e situação (ativo/inativo). O dono não se rebaixa nem se desativa: alguém precisa ficar no comando. */
export async function atualizarUsuarioAction(id: string, dados: { papel?: string; ativo?: boolean }): Promise<{ erro?: string }> {
  const acesso = await exigirDono();
  if ("erro" in acesso) return { erro: acesso.erro };
  if (!uuid.safeParse(id).success) return { erro: "Acesso inválido." };
  const papel = dados.papel === undefined ? undefined : z.enum(papelUsuarioEnum.enumValues).safeParse(dados.papel);
  if (papel && !papel.success) return { erro: "Papel inválido." };

  if (id === acesso.sessao.userId && ((papel && papel.data !== "dono") || dados.ativo === false)) {
    return { erro: "Você não pode tirar o próprio acesso de dono." };
  }
  const [donos] = await db.select({ n: sql<number>`count(*)::int` }).from(usuarios).where(sql`${usuarios.papel} = 'dono' and ${usuarios.ativo}`);
  const [alvo] = await db.select({ papel: usuarios.papel, ativo: usuarios.ativo, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!alvo) return { erro: "Acesso não encontrado." };
  const deixaDeSerDono = alvo.papel === "dono" && alvo.ativo && ((papel && papel.data !== "dono") || dados.ativo === false);
  if (deixaDeSerDono && (donos?.n ?? 0) <= 1) return { erro: "Precisa sobrar ao menos um dono ativo." };

  await db
    .update(usuarios)
    .set({ ...(papel ? { papel: papel.data } : {}), ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }) })
    .where(eq(usuarios.id, id));
  await registrar(acesso.sessao, { acao: papel ? "papel" : "editar", alvoTipo: "usuario", alvoId: id, detalhe: { nome: alvo.nome, papel: papel?.data, ativo: dados.ativo } });
  revalidatePath("/configuracoes/usuarios");
  return {};
}

/** Nova senha provisória para quem esqueceu a sua. */
export async function redefinirSenhaAction(id: string): Promise<{ erro?: string; senha?: string }> {
  const acesso = await exigirDono();
  if ("erro" in acesso) return { erro: acesso.erro };
  if (!uuid.safeParse(id).success) return { erro: "Acesso inválido." };
  const senha = senhaProvisoria();
  const [u] = await db
    .update(usuarios)
    .set({ senhaHash: await hashPassword(senha) })
    .where(eq(usuarios.id, id))
    .returning({ nome: usuarios.nome });
  if (!u) return { erro: "Acesso não encontrado." };
  await registrar(acesso.sessao, { acao: "senha", alvoTipo: "usuario", alvoId: id, detalhe: { nome: u.nome } });
  return { senha };
}
