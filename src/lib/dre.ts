/**
 * DRE e fluxo de caixa a partir das movimentações categorizadas. Sem I/O:
 * recebe a estrutura configurada e as somas por mês e categoria e monta as
 * linhas.
 *
 * Regime de caixa: cada valor entra no mês em que passou pela conta. Os
 * valores já vêm com sinal (entrada positiva, saída negativa), então cada
 * subtotal é só soma — custo e despesa reduzem o resultado por conta própria.
 */
import type { PapelLinhaDre, SecaoDre, TipoLinhaDre } from "@/db/schema";

export interface SomaMensal {
  mes: string; // YYYY-MM
  categoriaId: string | null;
  valorCentavos: number;
}

/** Linha da estrutura da DRE, como está configurada (aba Configurações). */
export interface LinhaDreConfig {
  id: string;
  nome: string;
  tipo: TipoLinhaDre;
  secao: SecaoDre;
  ordem: number;
  basePercentual: boolean;
  mostrarPercentual: boolean;
  /** Subtotal que alimenta os indicadores (margem de contribuição ou resultado operacional). */
  papel: PapelLinhaDre | null;
}

export interface CategoriaDre {
  id: string;
  nome: string;
  linhaId: string;
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

export interface LinhaMontada extends Serie {
  linha: LinhaDreConfig;
  /** Só em linhas de grupo, na ordem do plano de contas. */
  categorias: LinhaCategoria[];
}

export interface Dre {
  meses: string[];
  /** Todas as linhas configuradas, na ordem; subtotais já calculados. */
  linhas: LinhaMontada[];
  /** Soma de todos os grupos da seção DRE: o resultado do período. */
  resultado: Serie;
  /** A linha marcada como 100% dos percentuais, se houver. */
  base: LinhaMontada | null;
  semCategoria: Serie;
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

/**
 * Monta a DRE na estrutura configurada. Linha de grupo soma as categorias
 * dela; subtotal é a soma de todos os grupos da seção DRE acima dele — a
 * cascata receita → receita líquida → margem → resultado sai daí sozinha.
 * Categoria apontando para linha que não existe (ou que não é grupo) cai em
 * "sem categoria", para o total do caixa nunca deixar de fechar.
 */
export function montarDre(
  meses: string[],
  linhasConfig: LinhaDreConfig[],
  categorias: CategoriaDre[],
  somas: SomaMensal[]
): Dre {
  const doPeriodo = new Set(meses);
  const ordenadas = [...linhasConfig].sort((a, b) => a.ordem - b.ordem);
  const linhas: LinhaMontada[] = ordenadas.map((linha) => ({ linha, categorias: [], ...serieVazia(meses) }));
  const grupoPorId = new Map(linhas.filter((l) => l.linha.tipo === "grupo").map((l) => [l.linha.id, l]));
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
  const linhasCategoria = new Map<string, LinhaCategoria>();
  const semCategoria = serieVazia(meses);

  for (const s of somas) {
    if (!doPeriodo.has(s.mes)) continue;
    const categoria = s.categoriaId ? categoriaPorId.get(s.categoriaId) : undefined;
    const grupo = categoria ? grupoPorId.get(categoria.linhaId) : undefined;
    if (!categoria || !grupo) {
      acumular(semCategoria, s.mes, s.valorCentavos);
      continue;
    }
    let lc = linhasCategoria.get(categoria.id);
    if (!lc) {
      lc = { categoria, ...serieVazia(meses) };
      linhasCategoria.set(categoria.id, lc);
      grupo.categorias.push(lc);
    }
    acumular(lc, s.mes, s.valorCentavos);
    acumular(grupo, s.mes, s.valorCentavos);
  }

  let acumulado = serieVazia(meses);
  for (const l of linhas) {
    if (l.linha.tipo === "grupo") {
      l.categorias.sort((a, b) => a.categoria.ordem - b.categoria.ordem || a.categoria.nome.localeCompare(b.categoria.nome));
      if (l.linha.secao === "dre") acumulado = somar(meses, acumulado, l);
    } else {
      const sub = somar(meses, acumulado);
      l.porMes = sub.porMes;
      l.total = sub.total;
    }
  }

  const grupos = linhas.filter((l) => l.linha.tipo === "grupo");
  const resultado = somar(meses, ...grupos.filter((l) => l.linha.secao === "dre"));
  const base = linhas.find((l) => l.linha.basePercentual) ?? null;
  const variacaoCaixa = somar(meses, ...grupos, semCategoria);

  return { meses, linhas, resultado, base, semCategoria, variacaoCaixa };
}

export interface Indicadores {
  /** O subtotal marcado como margem de contribuição. */
  margem: LinhaMontada | null;
  /** O subtotal marcado como resultado operacional. */
  operacional: LinhaMontada | null;
  /** Tudo entre a margem e o resultado operacional, com sinal de custo (negativo). */
  custosFixos: Serie | null;
  /** Média mensal dos custos fixos nos meses considerados, positiva. */
  custosFixosMensais: number | null;
  /** Margem de contribuição sobre a linha base (receita líquida), 0–1. */
  margemSobreBase: number | null;
  /** Receita líquida mensal que cobre os custos fixos: fixos mensais ÷ margem %. */
  pontoDeEquilibrio: number | null;
  /** O mesmo ponto, em receita bruta (a primeira linha da DRE) — para comparar com as vendas. */
  pontoDeEquilibrioBruto: number | null;
  /** Receita líquida média por mês nos meses considerados. */
  receitaLiquidaMensal: number | null;
  /** Quantos meses entraram nas médias. */
  meses: number;
}

/**
 * Custos fixos e ponto de equilíbrio a partir dos subtotais marcados em
 * Configurações. As médias mensais usam só `mesesFechados` (sem o mês em
 * andamento, que ainda não tem todos os custos); vazio = todos os meses.
 */
export function indicadores(dre: Dre, mesesFechados: string[] = dre.meses): Indicadores {
  const margem = dre.linhas.find((l) => l.linha.tipo === "subtotal" && l.linha.papel === "margem") ?? null;
  const operacional = dre.linhas.find((l) => l.linha.tipo === "subtotal" && l.linha.papel === "operacional") ?? null;
  const meses = mesesFechados.length > 0 ? mesesFechados : dre.meses;
  const vazio: Indicadores = {
    margem,
    operacional,
    custosFixos: null,
    custosFixosMensais: null,
    margemSobreBase: null,
    pontoDeEquilibrio: null,
    pontoDeEquilibrioBruto: null,
    receitaLiquidaMensal: null,
    meses: meses.length,
  };
  if (!margem || !operacional) return vazio;

  const custosFixos: Serie = { porMes: {}, total: 0 };
  for (const m of dre.meses) {
    custosFixos.porMes[m] = (operacional.porMes[m] ?? 0) - (margem.porMes[m] ?? 0);
    custosFixos.total += custosFixos.porMes[m];
  }
  const somaEm = (serie: Serie) => meses.reduce((acc, m) => acc + (serie.porMes[m] ?? 0), 0);
  const fixosNoPeriodo = -somaEm(custosFixos);
  const custosFixosMensais = fixosNoPeriodo / meses.length;

  const base = dre.base;
  const receitaBruta = dre.linhas.find((l) => l.linha.secao === "dre" && l.linha.tipo === "grupo") ?? null;
  const baseNoPeriodo = base ? somaEm(base) : 0;
  const margemNoPeriodo = somaEm(margem);
  const margemSobreBase = baseNoPeriodo > 0 ? margemNoPeriodo / baseNoPeriodo : null;
  const brutaNoPeriodo = receitaBruta ? somaEm(receitaBruta) : 0;
  const margemSobreBruta = brutaNoPeriodo > 0 ? margemNoPeriodo / brutaNoPeriodo : null;

  return {
    ...vazio,
    custosFixos,
    custosFixosMensais,
    margemSobreBase,
    pontoDeEquilibrio: margemSobreBase && margemSobreBase > 0 ? Math.round(custosFixosMensais / margemSobreBase) : null,
    pontoDeEquilibrioBruto:
      margemSobreBruta && margemSobreBruta > 0 ? Math.round(custosFixosMensais / margemSobreBruta) : null,
    receitaLiquidaMensal: base ? baseNoPeriodo / meses.length : null,
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
