/**
 * Os papéis de acesso e o que cada um pode fazer. Sem I/O e sem `next/headers`,
 * para os componentes de cliente (lista de acessos, formulários) usarem os
 * rótulos; a checagem com sessão fica em `permissoes.ts`.
 */
import type { PapelUsuario } from "@/db/schema";

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

export function papelEdita(papel: PapelUsuario | undefined | null): boolean {
  return papel === "dono" || papel === "financeiro";
}

export function papelGereAcessos(papel: PapelUsuario | undefined | null): boolean {
  return papel === "dono";
}
