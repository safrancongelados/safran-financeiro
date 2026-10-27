/**
 * O que cada papel pode fazer. `dono` faz tudo, inclusive gerir acessos;
 * `financeiro` categoriza, configura e cadastra; `leitura` só consulta — o
 * contador, por exemplo. A checagem fica nas server actions, que são a
 * única porta de escrita.
 */
import { obterSessao, type SessionPayload } from "./auth";
import { papelEdita, papelGereAcessos } from "./papeis";

export { PAPEL_DESCRICAO, PAPEL_LABEL } from "./papeis";

export function podeEditar(sessao: SessionPayload | null): boolean {
  return papelEdita(sessao?.papel);
}

export function podeGerirAcessos(sessao: SessionPayload | null): boolean {
  return papelGereAcessos(sessao?.papel);
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
