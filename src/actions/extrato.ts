"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterSessao } from "@/lib/auth";
import { criarConnectToken } from "@/lib/pluggy/client";
import { sincronizarConexao, sincronizarTodas, type ResultadoSync } from "@/lib/pluggy/sync";

export interface ConectarBancoState {
  erro?: string;
  ok?: string;
}

const itemIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "O ID do item tem o formato de um UUID.");

function explicarFalha(r: Extract<ResultadoSync, { ok: false }>): string {
  if (r.status === 404) {
    return "Item não encontrado na Pluggy. Confira o ID no Meu Pluggy e se as credenciais configuradas são da mesma conta.";
  }
  if (r.status === 401 || r.status === 403) {
    return "A Pluggy recusou as credenciais. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.";
  }
  return r.erro;
}

async function conectar(itemIdBruto: unknown): Promise<ConectarBancoState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };

  const parsed = itemIdSchema.safeParse(itemIdBruto ?? "");
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "ID inválido." };

  const r = await sincronizarConexao(parsed.data.toLowerCase());
  revalidatePath("/", "layout");
  if (!r.ok) return { erro: explicarFalha(r) };

  return {
    ok: `${r.instituicao ?? "Banco"} conectado: ${r.contas} conta(s), ${r.movimentacoes} movimentação(ões).`,
  };
}

/** Conecta um banco já autorizado no Meu Pluggy, pelo ID do item colado na tela. */
export async function conectarBancoAction(
  _prev: ConectarBancoState,
  formData: FormData
): Promise<ConectarBancoState> {
  return conectar(formData.get("itemId"));
}

/** Registra o item que o widget do Pluggy Connect acabou de criar ou renovar. */
export async function registrarItemAction(itemId: string): Promise<ConectarBancoState> {
  return conectar(itemId);
}

/**
 * Token para o navegador abrir o Pluggy Connect. Só sócio logado gera: quem
 * tem o token conecta um banco dentro da aplicação da Safran.
 *
 * Com PLUGGY_WEBHOOK_SECRET configurado, a conexão já sai avisando o webhook a
 * cada atualização do banco. O endereço é sempre o de produção (a Vercel
 * informa em VERCEL_PROJECT_PRODUCTION_URL): uma prévia tem proteção de
 * acesso e recusaria o aviso. Fora da Vercel, fica sem webhook e vale o cron.
 */
export async function abrirConexaoAction(itemId?: string): Promise<{ token?: string; erro?: string }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (itemId !== undefined && !itemIdSchema.safeParse(itemId).success) return { erro: "Conexão inválida." };

  const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const segredo = process.env.PLUGGY_WEBHOOK_SECRET;
  const webhookUrl =
    dominio && segredo ? `https://${dominio}/api/webhooks/pluggy?segredo=${encodeURIComponent(segredo)}` : undefined;

  try {
    return { token: await criarConnectToken({ itemId, webhookUrl }) };
  } catch (err) {
    return { erro: `Não foi possível abrir a conexão: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface ResumoSync {
  instituicao: string | null;
  ok: boolean;
  movimentacoes: number;
  erro?: string;
}

export async function sincronizarExtratoAction(): Promise<ResumoSync[] | { erro: string }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };

  const resultados = await sincronizarTodas();
  revalidatePath("/", "layout");
  return resultados.map(({ instituicao, resultado: r }) =>
    r.ok
      ? { instituicao: r.instituicao ?? instituicao, ok: true, movimentacoes: r.movimentacoes }
      : { instituicao, ok: false, movimentacoes: 0, erro: explicarFalha(r) }
  );
}
