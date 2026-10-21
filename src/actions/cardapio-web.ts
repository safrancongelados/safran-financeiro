"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mapeamentoCardapioWeb } from "@/db/schema";
import { obterSessao } from "@/lib/auth";
import { sincronizarPedidos, type ResultadoSyncPedidos } from "@/lib/cardapio-web/sync";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

function revalidarTudo() {
  // Os pedidos mudam o rateio da DRE e a tela inicial.
  revalidatePath("/", "layout");
}

function explicarFalha(r: Extract<ResultadoSyncPedidos, { ok: false }>): string {
  if (r.status === 401 || r.status === 403) return "O Cardápio Web recusou o token. Confira CARDAPIO_WEB_TOKEN (e o header, se não for Authorization).";
  if (r.status === 404) return "Rota ou loja não encontrada no Cardápio Web. Confira CARDAPIO_WEB_API_URL e CARDAPIO_WEB_MERCHANT_UUID — e os caminhos em lib/cardapio-web/client.ts contra a Referência da API.";
  return r.erro;
}

/** Puxa os pedidos na hora, sem esperar o cron. Rodar duas vezes é seguro (upsert). */
export async function sincronizarPedidosAction(): Promise<{ erro: string } | Extract<ResultadoSyncPedidos, { ok: true }>> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  const r = await sincronizarPedidos();
  revalidarTudo();
  if (!r.ok) return { erro: explicarFalha(r) };
  return r;
}

/** Em que categoria da DRE uma categoria do cardápio vende. Vazio = na categoria rateada padrão. */
export async function salvarMapeamentoAction(id: string, categoriaId: string | null): Promise<{ erro?: string }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (!uuid.safeParse(id).success || (categoriaId !== null && !uuid.safeParse(categoriaId).success)) return { erro: "Dados inválidos." };
  const atualizadas = await db
    .update(mapeamentoCardapioWeb)
    .set({ categoriaId })
    .where(eq(mapeamentoCardapioWeb.id, id))
    .returning({ id: mapeamentoCardapioWeb.id });
  if (atualizadas.length === 0) return { erro: "Mapeamento não encontrado." };
  revalidarTudo();
  return {};
}
