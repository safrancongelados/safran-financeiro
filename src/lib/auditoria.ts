/**
 * Registro de quem mudou o quê. Chamado pelas actions depois de gravar;
 * nunca derruba a ação principal — uma falha aqui vai para o log e só.
 */
import { db } from "@/db";
import { auditoria } from "@/db/schema";
import type { SessionPayload } from "./auth";

export type AlvoAuditoria =
  | "movimentacao"
  | "regra"
  | "pessoa"
  | "linha_dre"
  | "categoria"
  | "centro_custo"
  | "usuario"
  | "alerta"
  | "visao"
  | "conexao"
  | "loja";

export interface Registro {
  /** categoria, nome, centro, so_nesta, lote, observacao, criar, editar, apagar, vincular... */
  acao: string;
  alvoTipo: AlvoAuditoria;
  alvoId?: string | null;
  /** O que mudou: de → para, quantas linhas, o nome do que foi criado. */
  detalhe?: Record<string, unknown>;
}

export async function registrar(sessao: SessionPayload, r: Registro): Promise<void> {
  try {
    await db.insert(auditoria).values({
      usuarioId: sessao.userId,
      usuarioNome: sessao.nome,
      acao: r.acao,
      alvoTipo: r.alvoTipo,
      alvoId: r.alvoId ?? null,
      detalhe: r.detalhe ?? null,
    });
  } catch (err) {
    console.error("[auditoria] não registrou:", err instanceof Error ? err.message : err);
  }
}

/** Como a tela de histórico descreve cada ação. */
export const ACAO_LABEL: Record<string, string> = {
  categoria: "mudou a categoria",
  nome: "renomeou",
  centro: "mudou o centro de custo",
  so_nesta: "fez exceção (só nesta)",
  lote: "categorizou em lote",
  observacao: "anotou",
  vincular: "vinculou a pessoa",
  criar: "criou",
  editar: "editou",
  apagar: "apagou",
  mover: "reordenou",
  senha: "redefiniu a senha",
  papel: "mudou o papel",
};

export const ALVO_LABEL: Record<AlvoAuditoria, string> = {
  movimentacao: "lançamento",
  regra: "regra",
  pessoa: "pessoa",
  linha_dre: "linha da DRE",
  categoria: "categoria",
  centro_custo: "centro de custo",
  usuario: "acesso",
  alerta: "alerta",
  visao: "visão salva",
  conexao: "conexão bancária",
  loja: "mix da loja",
};
