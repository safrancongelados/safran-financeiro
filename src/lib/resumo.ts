/**
 * O resumo da tela inicial: o mês em andamento comparado com o anterior até o
 * mesmo dia, o que mais pesou nas despesas e a série de 12 meses. Sem I/O —
 * recebe DREs já montadas.
 */
import type { Dre, LinhaMontada } from "./dre";

/** A primeira linha de grupo da DRE: a receita bruta, na estrutura inicial. */
export function linhaDeReceita(dre: Dre): LinhaMontada | undefined {
  return dre.linhas.find((l) => l.linha.secao === "dre" && l.linha.tipo === "grupo");
}

export interface NumerosDoMes {
  receita: number;
  resultado: number;
  /** A linha base dos percentuais (receita líquida), para "resultado é x% da receita". */
  base: number;
}

export function numerosDoMes(dre: Dre, mes: string): NumerosDoMes {
  return {
    receita: linhaDeReceita(dre)?.porMes[mes] ?? 0,
    resultado: dre.resultado.porMes[mes] ?? 0,
    base: dre.base?.porMes[mes] ?? 0,
  };
}

/** Variação relativa, ou null quando não há base de comparação. */
export function variacaoRelativa(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

export interface Despesa {
  categoriaId: string;
  nome: string;
  linha: string;
  centavos: number;
  /** Fração do total de despesas do mês (0–1). */
  parte: number;
}

/**
 * As categorias de saída da DRE com mais peso no mês, com a fração que cada
 * uma representa das saídas da DRE no mês.
 */
export function maioresDespesas(dre: Dre, mes: string, limite = 5): Despesa[] {
  const todas: Omit<Despesa, "parte">[] = [];
  for (const l of dre.linhas) {
    if (l.linha.secao !== "dre" || l.linha.tipo !== "grupo") continue;
    for (const c of l.categorias) {
      const v = c.porMes[mes] ?? 0;
      if (v < 0) todas.push({ categoriaId: c.categoria.id, nome: c.categoria.nome, linha: l.linha.nome, centavos: v });
    }
  }
  const total = todas.reduce((acc, d) => acc + d.centavos, 0);
  return todas
    .sort((a, b) => a.centavos - b.centavos)
    .slice(0, limite)
    .map((d) => ({ ...d, parte: total === 0 ? 0 : d.centavos / total }));
}

export interface PontoDoGrafico {
  mes: string;
  receita: number;
  resultado: number;
}

export function serieDoGrafico(dre: Dre): PontoDoGrafico[] {
  const receita = linhaDeReceita(dre);
  return dre.meses.map((mes) => ({
    mes,
    receita: receita?.porMes[mes] ?? 0,
    resultado: dre.resultado.porMes[mes] ?? 0,
  }));
}
