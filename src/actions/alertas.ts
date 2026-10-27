"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alertas, tipoAlertaEnum } from "@/db/schema";
import { ALERTA_INFO } from "@/lib/alertas";
import { registrar } from "@/lib/auditoria";
import { exigirEdicao } from "@/lib/permissoes";

/** Liga/desliga um alerta e grava os parâmetros dele (valores já em centavos, %, dias). */
export async function salvarAlertaAction(
  tipo: string,
  dados: { ativo: boolean; parametros: Record<string, number> }
): Promise<{ erro?: string }> {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return { erro: acesso.erro };
  const t = z.enum(tipoAlertaEnum.enumValues).safeParse(tipo);
  if (!t.success) return { erro: "Alerta desconhecido." };

  // Só os campos que o tipo conhece, e só números válidos.
  const parametros: Record<string, number> = {};
  for (const campo of ALERTA_INFO[t.data].campos) {
    const v = dados.parametros[campo.chave];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { erro: `Valor inválido em "${campo.rotulo}".` };
    parametros[campo.chave] = Math.round(v);
  }

  await db
    .insert(alertas)
    .values({ tipo: t.data, ativo: dados.ativo, parametros })
    .onConflictDoUpdate({ target: alertas.tipo, set: { ativo: dados.ativo, parametros } });
  await registrar(acesso.sessao, { acao: "editar", alvoTipo: "alerta", alvoId: t.data, detalhe: { ativo: dados.ativo, ...parametros } });
  revalidatePath("/", "layout");
  return {};
}

export async function listarAlertasAction() {
  return db.select().from(alertas).where(eq(alertas.ativo, true));
}
