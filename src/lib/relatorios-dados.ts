/**
 * Monta cada relatório a partir das queries: a tela e a exportação em CSV
 * usam a mesma montagem. Roda no servidor (lê o banco), mas não é action.
 */
import { listarPessoas } from "@/db/queries/pessoas";
import {
  categoriasComLinha,
  custosPorCategoriaMes,
  fornecedoresPorMes,
  pessoalPorMes,
  pessoalSemCadastroPorMes,
  receitaPorMes,
  topContrapartesPorCategoria,
  type TopContraparte,
} from "@/db/queries/relatorios";
import { intervaloDoPeriodo, mesesDoPeriodo, type Periodo } from "./periodo";
import { eCategoriaDeImposto, eCategoriaDePessoal, pivotarPorMes, tendencia, variacaoMensal, type LinhaMensal } from "./relatorios";

export interface LinhaPessoal extends LinhaMensal {
  nome: string;
  tipo: string;
  pessoaId: string | null;
  metaMensalCentavos: number | null;
  /** Soma do que passou da meta nos meses do período. */
  acimaDaMeta: number;
}

export interface RelatorioPessoal {
  meses: string[];
  cadastradas: LinhaPessoal[];
  /** Pagamentos em categoria de pessoal sem pessoa cadastrada, por contraparte. */
  semCadastro: LinhaPessoal[];
  totalPorMes: Record<string, number>;
  total: number;
}

export async function relatorioPessoal(periodo: Periodo, hoje: string): Promise<RelatorioPessoal> {
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const [somas, pessoas, cats] = await Promise.all([pessoalPorMes(inicio, fim), listarPessoas(inicio), categoriasComLinha()]);
  const idsPessoal = cats.filter((c) => eCategoriaDePessoal(c.nome, c.linhaNome)).map((c) => c.id);
  const semCadastroSomas = await pessoalSemCadastroPorMes(inicio, fim, idsPessoal);
  const porId = new Map(pessoas.map((p) => [p.id, p]));

  const montar = (l: LinhaMensal, nome: string, tipo: string, pessoaId: string | null, meta: number | null): LinhaPessoal => ({
    ...l,
    nome,
    tipo,
    pessoaId,
    metaMensalCentavos: meta,
    // Pagamento é saída (negativo); a meta é positiva.
    acimaDaMeta: meta == null ? 0 : meses.reduce((acc, m) => acc + Math.max(0, -(l.porMes[m] ?? 0) - meta), 0),
  });

  const cadastradas = pivotarPorMes(somas, meses).map((l) => {
    const p = porId.get(l.chave);
    return montar(l, p?.nome ?? "(pessoa removida)", p?.tipo ?? "outro", p?.id ?? null, p?.metaMensalCentavos ?? null);
  });
  const semCadastro = pivotarPorMes(semCadastroSomas, meses).map((l) => montar(l, l.chave, "sem cadastro", null, null));

  const totalPorMes: Record<string, number> = {};
  for (const m of meses) totalPorMes[m] = [...cadastradas, ...semCadastro].reduce((acc, l) => acc + (l.porMes[m] ?? 0), 0);
  const total = Object.values(totalPorMes).reduce((a, b) => a + b, 0);
  return { meses, cadastradas, semCadastro, totalPorMes, total };
}

export interface LinhaCusto extends LinhaMensal {
  nome: string;
  linhaNome: string;
  /** Participação no total de custos do período (0–1). */
  parte: number;
  /** Último mês fechado contra o anterior. */
  variacao: number | null;
  tendencia: number | null;
  top: TopContraparte[];
}

export interface RelatorioCustos {
  meses: string[];
  linhas: LinhaCusto[];
  totalPorMes: Record<string, number>;
  total: number;
  receitaPorMes: Record<string, number>;
}

export async function relatorioCustos(periodo: Periodo, hoje: string): Promise<RelatorioCustos> {
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const [somas, cats, top, receita] = await Promise.all([
    custosPorCategoriaMes(inicio, fim),
    categoriasComLinha(),
    topContrapartesPorCategoria(inicio, fim),
    receitaPorMes(inicio, fim),
  ]);
  const porId = new Map(cats.map((c) => [c.id, c]));
  const pivot = pivotarPorMes(somas, meses);
  const total = pivot.reduce((acc, l) => acc + l.total, 0);
  // Variação do último mês fechado (o corrente ainda está em andamento).
  const fechados = meses.filter((m) => m < hoje.slice(0, 7));
  const ultimo = fechados[fechados.length - 1];
  const penultimo = fechados[fechados.length - 2];

  const linhas = pivot.map((l): LinhaCusto => {
    const c = porId.get(l.chave);
    return {
      ...l,
      nome: c?.nome ?? "(categoria removida)",
      linhaNome: c?.linhaNome ?? "",
      parte: total === 0 ? 0 : l.total / total,
      variacao: ultimo && penultimo ? variacaoMensal(l, ultimo, penultimo) : null,
      tendencia: tendencia(l, meses),
      top: top.filter((t) => t.categoriaId === l.chave),
    };
  });
  const totalPorMes: Record<string, number> = {};
  for (const m of meses) totalPorMes[m] = pivot.reduce((acc, l) => acc + (l.porMes[m] ?? 0), 0);
  return { meses, linhas, totalPorMes, total, receitaPorMes: receita };
}

export interface LinhaFornecedor extends LinhaMensal {
  nome: string;
  pessoaId: string | null;
  documento: string | null;
  categoriaNome: string | null;
  tendencia: number | null;
  ultimoMes: string | null;
}

export interface RelatorioFornecedores {
  meses: string[];
  linhas: LinhaFornecedor[];
  total: number;
}

export async function relatorioFornecedores(periodo: Periodo, hoje: string, limite = 80): Promise<RelatorioFornecedores> {
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const somas = await fornecedoresPorMes(inicio, fim);
  const info = new Map<string, (typeof somas)[number]>();
  for (const s of somas) if (!info.has(s.chave)) info.set(s.chave, s);
  const pivot = pivotarPorMes(somas, meses);
  const total = pivot.reduce((acc, l) => acc + l.total, 0);
  const linhas = pivot.slice(0, limite).map((l): LinhaFornecedor => {
    const i = info.get(l.chave)!;
    const comMovimento = meses.filter((m) => (l.porMes[m] ?? 0) !== 0);
    return {
      ...l,
      nome: i.nome,
      pessoaId: i.pessoaId,
      documento: i.documento,
      categoriaNome: i.categoriaNome,
      tendencia: tendencia(l, meses),
      ultimoMes: comMovimento[comMovimento.length - 1] ?? null,
    };
  });
  return { meses, linhas, total };
}

export interface RelatorioImpostos {
  meses: string[];
  linhas: (LinhaMensal & { nome: string })[];
  totalPorMes: Record<string, number>;
  total: number;
  receitaPorMes: Record<string, number>;
  receitaTotal: number;
  /** Impostos ÷ receita, em fração. Nulo sem receita. */
  aliquotaPorMes: Record<string, number | null>;
  aliquota: number | null;
}

export async function relatorioImpostos(periodo: Periodo, hoje: string): Promise<RelatorioImpostos> {
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);
  const [somas, cats, receita] = await Promise.all([custosPorCategoriaMes(inicio, fim), categoriasComLinha(), receitaPorMes(inicio, fim)]);
  const impostos = new Map(cats.filter((c) => eCategoriaDeImposto(c.nome)).map((c) => [c.id, c.nome]));
  const linhas = pivotarPorMes(
    somas.filter((s) => impostos.has(s.chave)),
    meses
  ).map((l) => ({ ...l, nome: impostos.get(l.chave) ?? "" }));
  const totalPorMes: Record<string, number> = {};
  const aliquotaPorMes: Record<string, number | null> = {};
  for (const m of meses) {
    totalPorMes[m] = linhas.reduce((acc, l) => acc + (l.porMes[m] ?? 0), 0);
    const r = receita[m] ?? 0;
    aliquotaPorMes[m] = r > 0 ? -totalPorMes[m] / r : null;
  }
  const total = Object.values(totalPorMes).reduce((a, b) => a + b, 0);
  const receitaTotal = meses.reduce((acc, m) => acc + (receita[m] ?? 0), 0);
  return { meses, linhas, totalPorMes, total, receitaPorMes: receita, receitaTotal, aliquotaPorMes, aliquota: receitaTotal > 0 ? -total / receitaTotal : null };
}
