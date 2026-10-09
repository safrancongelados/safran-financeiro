import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categorias,
  centrosCusto,
  conexoesBancarias,
  contasBancarias,
  linhasDre,
  movimentacoesBancarias,
  regrasCategorizacao,
} from "@/db/schema";
import type { CategoriaDre, LinhaDreConfig, SomaMensal } from "@/lib/dre";
import { regraCasa, type RegraAplicavel } from "@/lib/regras";
import { intervaloDoMes } from "@/lib/periodo";

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

export interface FiltroExtrato {
  contaId?: string;
  categoriaId?: string;
  semCategoria?: boolean;
}

/** Movimentações de um mês, mais recentes primeiro. Sem o payload bruto, que é pesado. */
export async function listarMovimentacoesDoMes(mes: string, filtro: FiltroExtrato = {}) {
  const { inicio, fim } = intervaloDoMes(mes);
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
    .where(
      and(
        gte(movimentacoesBancarias.data, inicio),
        lt(movimentacoesBancarias.data, fim),
        filtro.contaId ? eq(movimentacoesBancarias.contaId, filtro.contaId) : undefined,
        filtro.categoriaId ? eq(movimentacoesBancarias.categoriaId, filtro.categoriaId) : undefined,
        filtro.semCategoria ? isNull(movimentacoesBancarias.categoriaId) : undefined
      )
    )
    .orderBy(desc(movimentacoesBancarias.data), desc(movimentacoesBancarias.createdAt));
}

export type MovimentacaoLinha = Awaited<ReturnType<typeof listarMovimentacoesDoMes>>[number];

// DRE e fluxo de caixa contam só contas (BANK). No cartão o dinheiro sai
// quando a fatura é paga, e esse pagamento já aparece na conta.
const SO_CONTAS = eq(contasBancarias.tipo, "BANK");
const MES = sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`;

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
    .select({ id: categorias.id, nome: categorias.nome, linhaId: categorias.linhaId, ordem: categorias.ordem })
    .from(categorias);
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
