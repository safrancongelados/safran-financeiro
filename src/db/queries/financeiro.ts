import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  categorias,
  centrosCusto,
  conexoesBancarias,
  contasBancarias,
  linhasDre,
  movimentacoesBancarias,
  regrasCategorizacao,
  vendasPorProduto,
} from "@/db/schema";
import type { CategoriaDre, LinhaDreConfig, MixVendas, SomaMensal } from "@/lib/dre";
import type { FiltroExtrato } from "@/lib/extrato-filtros";
import { DIRECAO_PADRAO } from "@/lib/extrato-filtros";
import { normalizarTexto, regraCasa, type RegraAplicavel } from "@/lib/regras";
import { intervaloDoMes, mesmoDiaEm } from "@/lib/periodo";

export type ContaBancaria = typeof contasBancarias.$inferSelect;
export type ConexaoBancaria = typeof conexoesBancarias.$inferSelect & { contas: ContaBancaria[] };

export async function listarConexoesComContas(): Promise<ConexaoBancaria[]> {
  const [conexoes, contas] = await Promise.all([
    db.select().from(conexoesBancarias).orderBy(asc(conexoesBancarias.createdAt)),
    db.select().from(contasBancarias).orderBy(asc(contasBancarias.nome)),
  ]);
  return conexoes.map((c) => ({ ...c, contas: contas.filter((ct) => ct.conexaoId === c.id) }));
}

export async function listarCategorias(): Promise<(typeof categorias.$inferSelect)[]> {
  return db.select().from(categorias).orderBy(asc(categorias.ordem), asc(categorias.nome));
}

/** A estrutura da DRE, na ordem em que aparece. */
export async function listarLinhasDre(): Promise<LinhaDreConfig[]> {
  return db
    .select({
      id: linhasDre.id,
      nome: linhasDre.nome,
      tipo: linhasDre.tipo,
      secao: linhasDre.secao,
      ordem: linhasDre.ordem,
      basePercentual: linhasDre.basePercentual,
      mostrarPercentual: linhasDre.mostrarPercentual,
      papel: linhasDre.papel,
    })
    .from(linhasDre)
    .orderBy(asc(linhasDre.ordem), asc(linhasDre.nome));
}

export async function listarCentrosCusto(): Promise<(typeof centrosCusto.$inferSelect)[]> {
  return db.select().from(centrosCusto).orderBy(asc(centrosCusto.ordem), asc(centrosCusto.nome));
}

export async function listarRegras() {
  return db
    .select({
      id: regrasCategorizacao.id,
      campo: regrasCategorizacao.campo,
      padrao: regrasCategorizacao.padrao,
      sentido: regrasCategorizacao.sentido,
      nomeExibicao: regrasCategorizacao.nomeExibicao,
      categoriaId: regrasCategorizacao.categoriaId,
      categoriaNome: categorias.nome,
      centroCustoId: regrasCategorizacao.centroCustoId,
      createdAt: regrasCategorizacao.createdAt,
    })
    .from(regrasCategorizacao)
    .leftJoin(categorias, eq(regrasCategorizacao.categoriaId, categorias.id))
    .orderBy(asc(regrasCategorizacao.campo), asc(regrasCategorizacao.padrao));
}

export type RegraLinha = Awaited<ReturnType<typeof listarRegras>>[number];

/**
 * Quantas movimentações casam com cada regra hoje (pelo texto/documento, não
 * importa se outra regra mais específica decidiu algum campo).
 */
export async function contarPorRegra(regras: RegraAplicavel[]): Promise<Map<string, number>> {
  const movs = await db
    .select({
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
    })
    .from(movimentacoesBancarias);
  return new Map(regras.map((r) => [r.id, movs.filter((m) => regraCasa(r, m)).length]));
}

// DRE e fluxo de caixa contam só contas (BANK). No cartão o dinheiro sai
// quando a fatura é paga, e esse pagamento já aparece na conta.
const SO_CONTAS = eq(contasBancarias.tipo, "BANK");
const MES = sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`;

/** Minúsculo e sem acento, no Postgres — o par de `normalizarTexto` para a busca. */
const semAcento = (coluna: SQL | typeof movimentacoesBancarias.descricao) =>
  sql`translate(lower(${coluna}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;

/** Trecho para LIKE, com os curingas do termo escapados. */
function trecho(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * A condição da busca livre: nome de exibição, descrição ou contraparte
 * contendo o texto (sem acento nem caixa); com dígitos, também o CPF/CNPJ.
 */
function condicaoBusca(q: string): SQL | undefined {
  const termo = normalizarTexto(q);
  if (!termo) return undefined;
  const t = trecho(termo);
  const partes: SQL[] = [
    sql`${semAcento(movimentacoesBancarias.descricao)} like ${t}`,
    sql`${semAcento(sql`coalesce(${movimentacoesBancarias.contraparte}, '')`)} like ${t}`,
    sql`${semAcento(sql`coalesce(${movimentacoesBancarias.nomeExibicao}, '')`)} like ${t}`,
  ];
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 4) partes.push(sql`coalesce(${movimentacoesBancarias.contraparteDocumento}, '') like ${trecho(digitos)}`);
  return or(...partes);
}

function condicoesDoFiltro(filtro: FiltroExtrato): (SQL | undefined)[] {
  const { inicio, fim } = intervaloDoMes(filtro.mes);
  return [
    gte(movimentacoesBancarias.data, inicio),
    lt(movimentacoesBancarias.data, fim),
    filtro.conta ? eq(movimentacoesBancarias.contaId, filtro.conta) : undefined,
    filtro.categoria === "sem"
      ? isNull(movimentacoesBancarias.categoriaId)
      : filtro.categoria
        ? eq(movimentacoesBancarias.categoriaId, filtro.categoria)
        : undefined,
    filtro.centro === "sem"
      ? isNull(movimentacoesBancarias.centroCustoId)
      : filtro.centro
        ? eq(movimentacoesBancarias.centroCustoId, filtro.centro)
        : undefined,
    filtro.tipo === "entrada"
      ? gte(movimentacoesBancarias.valorCentavos, 0)
      : filtro.tipo === "saida"
        ? lt(movimentacoesBancarias.valorCentavos, 0)
        : undefined,
    filtro.q ? condicaoBusca(filtro.q) : undefined,
  ];
}

function ordenacao(filtro: FiltroExtrato): SQL[] {
  const ordem = filtro.ordem ?? "data";
  const dir = filtro.dir ?? DIRECAO_PADRAO[ordem];
  const sentido = dir === "asc" ? asc : desc;
  const porData = [desc(movimentacoesBancarias.data), desc(movimentacoesBancarias.createdAt)];
  switch (ordem) {
    case "valor":
      // Pelo tamanho, não pelo sinal: "maiores primeiro" mistura entradas e saídas.
      return [sentido(sql`abs(${movimentacoesBancarias.valorCentavos})`), ...porData];
    case "nome":
      return [sentido(semAcento(sql`coalesce(${movimentacoesBancarias.nomeExibicao}, ${movimentacoesBancarias.descricao})`)), ...porData];
    default:
      return [sentido(movimentacoesBancarias.data), sentido(movimentacoesBancarias.createdAt)];
  }
}

/** Movimentações do mês que passam pelo filtro, na ordem pedida (padrão: mais recentes primeiro). Sem o payload bruto, que é pesado. */
export async function listarMovimentacoesDoMes(filtro: FiltroExtrato) {
  return db
    .select({
      id: movimentacoesBancarias.id,
      data: movimentacoesBancarias.data,
      descricao: movimentacoesBancarias.descricao,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      meio: movimentacoesBancarias.meio,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      categoriaPluggy: movimentacoesBancarias.categoriaPluggy,
      categoriaId: movimentacoesBancarias.categoriaId,
      categorizadaPor: movimentacoesBancarias.categorizadaPor,
      categoriaNome: categorias.nome,
      /** Seção da linha da DRE da categoria: `transferencia` não conta como entrada/saída. */
      categoriaSecao: linhasDre.secao,
      /** Centro padrão da categoria — o que o extrato mostra como "(padrão)". */
      categoriaCentroId: categorias.centroCustoId,
      regraId: movimentacoesBancarias.regraId,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      centroCustoId: movimentacoesBancarias.centroCustoId,
      contaNome: contasBancarias.nome,
      contaTipo: contasBancarias.tipo,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .leftJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
    .where(and(...condicoesDoFiltro(filtro)))
    .orderBy(...ordenacao(filtro));
}

export type MovimentacaoLinha = Awaited<ReturnType<typeof listarMovimentacoesDoMes>>[number];

export interface TotaisDoMes {
  /** Entradas e saídas do caixa: só contas (não cartão) e sem transferência entre contas próprias. */
  entradasCentavos: number;
  saidasCentavos: number;
  lancamentos: number;
  semCategoria: number;
}

/** Os números do mês inteiro, independentes do filtro da tela. */
export async function totaisDoMes(mes: string): Promise<TotaisDoMes> {
  const { inicio, fim } = intervaloDoMes(mes);
  const doCaixa = sql`${contasBancarias.tipo} = 'BANK' and coalesce(${linhasDre.secao}, 'dre') <> 'transferencia'`;
  const [r] = await db
    .select({
      entradas: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${doCaixa} and ${movimentacoesBancarias.valorCentavos} > 0), 0)`,
      saidas: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${doCaixa} and ${movimentacoesBancarias.valorCentavos} < 0), 0)`,
      lancamentos: sql<number>`count(*)::int`,
      semCategoria: sql<number>`count(*) filter (where ${movimentacoesBancarias.categoriaId} is null)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .leftJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
    .where(and(gte(movimentacoesBancarias.data, inicio), lt(movimentacoesBancarias.data, fim)));
  return {
    entradasCentavos: Number(r?.entradas ?? 0),
    saidasCentavos: Number(r?.saidas ?? 0),
    lancamentos: r?.lancamentos ?? 0,
    semCategoria: r?.semCategoria ?? 0,
  };
}

/** Os meses (YYYY-MM) em que houve movimento em conta, do mais antigo ao mais novo. */
export async function mesesComMovimento(): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ mes: MES })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(SO_CONTAS)
    .orderBy(MES);
  return linhas.map((l) => l.mes);
}

/** As últimas movimentações em conta, para a tela inicial. */
export async function listarMovimentacoesRecentes(limite: number) {
  return db
    .select({
      id: movimentacoesBancarias.id,
      data: movimentacoesBancarias.data,
      descricao: movimentacoesBancarias.descricao,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      categoriaId: movimentacoesBancarias.categoriaId,
      categoriaNome: categorias.nome,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .where(SO_CONTAS)
    .orderBy(desc(movimentacoesBancarias.data), desc(movimentacoesBancarias.createdAt))
    .limit(limite);
}

/**
 * Soma por mês e categoria no intervalo [inicio, fim) — a matéria-prima da
 * DRE. Com `centro`, só o que conta naquele centro de custo ("sem" = sem centro).
 */
export async function somasPorMesECategoria(inicio: string, fim: string, centro?: string): Promise<SomaMensal[]> {
  const linhas = await db
    .select({
      mes: MES,
      categoriaId: movimentacoesBancarias.categoriaId,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(
      and(
        SO_CONTAS,
        gte(movimentacoesBancarias.data, inicio),
        lt(movimentacoesBancarias.data, fim),
        centro === "sem"
          ? isNull(movimentacoesBancarias.centroCustoId)
          : centro
            ? eq(movimentacoesBancarias.centroCustoId, centro)
            : undefined
      )
    )
    .groupBy(MES, movimentacoesBancarias.categoriaId);
  // sum() de integer volta bigint, que o driver entrega como texto.
  return linhas.map((l) => ({ ...l, valorCentavos: Number(l.valorCentavos) }));
}

/**
 * Soma por categoria de um mês só até o dia `dia` (inclusive) — para comparar
 * o mês em andamento com o anterior no mesmo ponto.
 */
export async function somasAteODia(mes: string, dia: number): Promise<SomaMensal[]> {
  const linhas = await db
    .select({
      categoriaId: movimentacoesBancarias.categoriaId,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(SO_CONTAS, gte(movimentacoesBancarias.data, `${mes}-01`), lte(movimentacoesBancarias.data, mesmoDiaEm(mes, dia))))
    .groupBy(movimentacoesBancarias.categoriaId);
  return linhas.map((l) => ({ mes, categoriaId: l.categoriaId, valorCentavos: Number(l.valorCentavos) }));
}

/** Variação total por mês a partir de `inicio`, até hoje — para reconstruir os saldos. */
export async function variacaoPorMesDesde(inicio: string): Promise<Map<string, number>> {
  const linhas = await db
    .select({ mes: MES, valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})` })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(SO_CONTAS, gte(movimentacoesBancarias.data, inicio)))
    .groupBy(MES);
  return new Map(linhas.map((l) => [l.mes, Number(l.valorCentavos)]));
}

export async function saldoAtualDasContas(): Promise<{ saldoCentavos: number; atualizadoEm: Date | null }> {
  const [r] = await db
    .select({
      saldo: sql<string>`coalesce(sum(${contasBancarias.saldoCentavos}), 0)`,
      atualizadoEm: sql<Date | null>`max(${contasBancarias.updatedAt})`,
    })
    .from(contasBancarias)
    .where(SO_CONTAS);
  return { saldoCentavos: Number(r?.saldo ?? 0), atualizadoEm: r?.atualizadoEm ? new Date(r.atualizadoEm) : null };
}

export async function categoriasParaDre(): Promise<CategoriaDre[]> {
  return db
    .select({
      id: categorias.id,
      nome: categorias.nome,
      linhaId: categorias.linhaId,
      ordem: categorias.ordem,
      rateada: categorias.rateada,
      linhaProduto: categorias.linhaProduto,
    })
    .from(categorias);
}

/** O mix de vendas da loja por mês, em centavos, para os meses do intervalo [inicio, fim) (datas YYYY-MM-DD). */
export async function mixPorMes(inicio: string, fim: string): Promise<MixVendas> {
  const linhas = await db
    .select()
    .from(vendasPorProduto)
    .where(and(gte(vendasPorProduto.mes, inicio.slice(0, 7)), lt(vendasPorProduto.mes, fim.slice(0, 7))));
  const mix: MixVendas = {};
  for (const l of linhas) (mix[l.mes] ??= {})[l.linha] = l.valorCentavos;
  return mix;
}

/** Todas as vendas por produto registradas, do mês mais novo ao mais antigo. */
export async function listarVendasPorProduto() {
  return db.select().from(vendasPorProduto).orderBy(desc(vendasPorProduto.mes), asc(vendasPorProduto.linha));
}

/** Quantas movimentações de conta ainda estão sem categoria — o que falta para a DRE fechar. */
export async function contarSemCategoria(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(SO_CONTAS, isNull(movimentacoesBancarias.categoriaId)));
  return r?.n ?? 0;
}
