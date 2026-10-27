"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { visoesSalvas } from "@/db/schema";
import { registrar } from "@/lib/auditoria";
import { exigirEdicao } from "@/lib/permissoes";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Guarda a combinação de filtros do extrato com um nome. Os parâmetros vêm da URL, sem o "?". */
export async function salvarVisaoAction(nome: string, params: string): Promise<{ erro?: string; id?: string }> {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return { erro: acesso.erro };
  const n = nome.trim();
  if (n.length < 2 || n.length > 40) return { erro: "O nome precisa ter entre 2 e 40 caracteres." };
  const p = params.replace(/^\?/, "").trim();
  if (!p || p.length > 500) return { erro: "Filtros inválidos." };

  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${visoesSalvas.ordem}), 0)::int` }).from(visoesSalvas);
  const [visao] = await db.insert(visoesSalvas).values({ nome: n, params: p, ordem: max + 10 }).returning({ id: visoesSalvas.id });
  await registrar(acesso.sessao, { acao: "criar", alvoTipo: "visao", alvoId: visao.id, detalhe: { nome: n } });
  revalidatePath("/extrato");
  return { id: visao.id };
}

export async function excluirVisaoAction(id: string): Promise<{ erro?: string }> {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return { erro: acesso.erro };
  if (!uuid.safeParse(id).success) return { erro: "Visão inválida." };
  const [v] = await db.delete(visoesSalvas).where(eq(visoesSalvas.id, id)).returning({ nome: visoesSalvas.nome });
  if (v) await registrar(acesso.sessao, { acao: "apagar", alvoTipo: "visao", alvoId: id, detalhe: { nome: v.nome } });
  revalidatePath("/extrato");
  return {};
}
