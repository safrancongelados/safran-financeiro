/** Opções dos seletores de categoria e centro de custo — sem I/O. */
import type { LinhaProduto, PapelLinhaDre, SecaoDre } from "@/db/schema";

export const SECAO_LABEL: Record<SecaoDre, string> = {
  dre: "Na DRE",
  caixa: "Fora da DRE (só caixa)",
  transferencia: "Transferência entre contas",
};

export const PAPEL_LABEL: Record<PapelLinhaDre, string> = {
  margem: "margem de contribuição",
  operacional: "resultado operacional",
};

export const LINHA_PRODUTO_LABEL: Record<LinhaProduto, string> = {
  marmitas: "Marmitas",
  porcoes: "Porções",
  dietas: "Dietas personalizadas",
  personal_chef: "Personal chef",
};

export const LINHAS_PRODUTO = Object.keys(LINHA_PRODUTO_LABEL) as LinhaProduto[];

/** O que uma categoria faz no rateio das vendas: nada, é a base, ou recebe uma linha de produto. */
export type PapelRateio = "" | "base" | LinhaProduto;

export function papelRateioDe(c: { rateada: boolean; linhaProduto: LinhaProduto | null }): PapelRateio {
  return c.rateada ? "base" : (c.linhaProduto ?? "");
}

export interface GrupoOpcoes {
  label: string;
  itens: { id: string; nome: string }[];
}

/**
 * Categorias ativas agrupadas pela linha da DRE em que somam, na ordem
 * configurada. Linha sem categoria ativa não aparece.
 */
export function opcoesDeCategoria(
  linhas: { id: string; nome: string; tipo: string; ordem: number }[],
  categorias: { id: string; nome: string; linhaId: string; ativa: boolean; ordem: number }[]
): GrupoOpcoes[] {
  return [...linhas]
    .filter((l) => l.tipo === "grupo")
    .sort((a, b) => a.ordem - b.ordem)
    .map((l) => ({
      label: l.nome,
      itens: categorias
        .filter((c) => c.ativa && c.linhaId === l.id)
        .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
        .map((c) => ({ id: c.id, nome: c.nome })),
    }))
    .filter((g) => g.itens.length > 0);
}

export interface OpcaoCentro {
  id: string;
  nome: string;
}

export function opcoesDeCentro(centros: { id: string; nome: string; ativo: boolean; ordem: number }[]): OpcaoCentro[] {
  return [...centros]
    .filter((c) => c.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((c) => ({ id: c.id, nome: c.nome }));
}
