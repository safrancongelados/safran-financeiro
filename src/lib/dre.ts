/**
 * DRE e fluxo de caixa a partir das movimentações categorizadas. Sem I/O:
 * recebe somas por mês e categoria e monta as linhas.
 *
 * Regime de caixa: cada valor entra no mês em que passou pela conta. Os
 * valores já vêm com sinal (entrada positiva, saída negativa), então cada
 * subtotal é só soma — custo e despesa reduzem o resultado por conta própria.
 */
import type { GrupoDre } from "@/db/schema";
import { GRUPOS } from "./grupos";

export interface SomaMensal {
  mes: string; // YYYY-MM
  categoriaId: string | null;
  valorCentavos: number;
}

export interface CategoriaDre {
  id: string;
  nome: string;
  grupo: GrupoDre;
  ordem: number;
}

/** Valor por mês e o total do período. */
export interface Serie {
  porMes: Record<string, number>;
  total: number;
}

export interface LinhaCategoria extends Serie {
  categoria: CategoriaDre;
}

export interface Dre {
  meses: string[];
  grupos: Record<GrupoDre, Serie & { categorias: LinhaCategoria[] }>;
  semCategoria: Serie;
  receitaLiquida: Serie;
  margemContribuicao: Serie;
  resultadoOperacional: Serie;
  resultadoLiquido: Serie;
  /** Tudo que passou pela conta: resultado + o que fica fora da DRE + o que falta categorizar. */
  variacaoCaixa: Serie;
}

function serieVazia(meses: string[]): Serie {
  return { porMes: Object.fromEntries(meses.map((m) => [m, 0])), total: 0 };
}

function somar(meses: string[], ...series: Serie[]): Serie {
  const r = serieVazia(meses);
  for (const s of series) {
    for (const m of meses) r.porMes[m] += s.porMes[m] ?? 0;
    r.total += s.total;
  }
  return r;
}

function acumular(serie: Serie, mes: string, valor: number) {
  serie.porMes[mes] += valor;
  serie.total += valor;
}

export function montarDre(meses: string[], categorias: CategoriaDre[], somas: SomaMensal[]): Dre {
  const doPeriodo = new Set(meses);
  const porId = new Map(categorias.map((c) => [c.id, c]));

  const grupos = Object.fromEntries(
    GRUPOS.map((g) => [g.id, { ...serieVazia(meses), categorias: [] as LinhaCategoria[] }])
  ) as Dre["grupos"];
  const linhas = new Map<string, LinhaCategoria>();
  const semCategoria = serieVazia(meses);

  for (const s of somas) {
    if (!doPeriodo.has(s.mes)) continue;
    const categoria = s.categoriaId ? porId.get(s.categoriaId) : undefined;
    if (!categoria) {
      acumular(semCategoria, s.mes, s.valorCentavos);
      continue;
    }
    let linha = linhas.get(categoria.id);
    if (!linha) {
      linha = { categoria, ...serieVazia(meses) };
      linhas.set(categoria.id, linha);
      grupos[categoria.grupo].categorias.push(linha);
    }
    acumular(linha, s.mes, s.valorCentavos);
    acumular(grupos[categoria.grupo], s.mes, s.valorCentavos);
  }

  for (const g of Object.values(grupos)) g.categorias.sort((a, b) => a.categoria.ordem - b.categoria.ordem);

  const receitaLiquida = somar(meses, grupos.receita, grupos.deducao);
  const margemContribuicao = somar(meses, receitaLiquida, grupos.custo_variavel);
  const resultadoOperacional = somar(meses, margemContribuicao, grupos.despesa_fixa);
  const resultadoLiquido = somar(meses, resultadoOperacional, grupos.financeiro);
  const variacaoCaixa = somar(
    meses,
    resultadoLiquido,
    grupos.investimento,
    grupos.financiamento,
    grupos.socios,
    grupos.transferencia,
    semCategoria
  );

  return {
    meses,
    grupos,
    semCategoria,
    receitaLiquida,
    margemContribuicao,
    resultadoOperacional,
    resultadoLiquido,
    variacaoCaixa,
  };
}

/**
 * Saldo no fim de cada mês, reconstruído de trás para frente a partir do saldo
 * de hoje: saldo no fim de M = saldo atual − tudo o que entrou/saiu depois de M.
 * Não depende de ter o extrato desde a abertura da conta.
 *
 * `variacaoPorMes` precisa cobrir todos os meses com movimento depois do
 * primeiro mês pedido, até hoje. Mês ainda não terminado tem saldo de hoje;
 * mês futuro fica null.
 */
export function saldosNoFimDoMes(
  saldoAtualCentavos: number,
  variacaoPorMes: Map<string, number>,
  meses: string[],
  mesCorrente: string
): Record<string, number | null> {
  const resultado: Record<string, number | null> = {};
  for (const mes of meses) {
    if (mes > mesCorrente) {
      resultado[mes] = null;
      continue;
    }
    let depois = 0;
    for (const [m, v] of variacaoPorMes) if (m > mes) depois += v;
    resultado[mes] = saldoAtualCentavos - depois;
  }
  return resultado;
}
