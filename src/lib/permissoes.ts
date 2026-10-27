/**
 * O que cada papel pode fazer. `dono` faz tudo, inclusive gerir acessos;
 * `financeiro` categoriza, configura e cadastra; `leitura` só consulta — o
 * contador, por exemplo. A checagem fica nas server actions, que são a
 * única porta de escrita.
 */
import type { PapelUsuario } from "@/db/schema";
import { obterSessao, type SessionPayload } from "./auth";

export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  dono: "Dono",
  financeiro: "Financeiro",
  leitura: "Somente leitura",
};

export const PAPEL_DESCRICAO: Record<PapelUsuario, string> = {
  dono: "Tudo, inclusive criar e remover acessos.",
  financeiro: "Categoriza, cadastra pessoas e muda a estrutura; não mexe em acessos.",
  leitura: "Só vê extrato, DRE e relatórios.",
};

export function podeEditar(sessao: SessionPayload | null): boolean {
  return sessao?.papel === "dono" || sessao?.papel === "financeiro";
}

export function podeGerirAcessos(sessao: SessionPayload | null): boolean {
  return sessao?.papel === "dono";
}

type Exigencia = { sessao: SessionPayload } | { erro: string };

/** Para toda action que grava alguma coisa. */
export async function exigirEdicao(): Promise<Exigencia> {
  const sessao = await obterSessao();
  if (!sessao) return { erro: "Sessão expirada." };
  if (!podeEditar(sessao)) return { erro: "Seu acesso é somente leitura." };
  return { sessao };
}

/** Para criar, alterar e remover acessos. */
export async function exigirDono(): Promise<Exigencia> {
  const sessao = await obterSessao();
  if (!sessao) return { erro: "Sessão expirada." };
  if (!podeGerirAcessos(sessao)) return { erro: "Só o dono gerencia acessos." };
  return { sessao };
}
