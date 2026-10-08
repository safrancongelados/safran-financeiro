import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categorias,
  conexoesBancarias,
  contasBancarias,
  movimentacoesBancarias,
  regrasCategorizacao,
} from "@/db/schema";
import type { CategoriaDre, SomaMensal } from "@/lib/dre";
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
      /** Quantas movimentações casam com a regra hoje (inclusive as categorizadas à mão). */
      lancamentos: sql<number>`(select count(*)::int from ${movimentacoesBancarias} where ${movimentacoesBancarias.regraId} = ${regrasCategorizacao.id})`,
      createdAt: regrasCategorizacao.createdAt,
    })
    .from(regrasCategorizacao)
    .innerJoin(categorias, eq(regrasCategorizacao.categoriaId, categorias.id))
    .orderBy(asc(categorias.nome), asc(regrasCategorizacao.padrao));
}

export type RegraLinha = Awaited<ReturnType<typeof listarRegras>>[number];

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
      categoriaGrupo: categorias.grupo,
      regraId: movimentacoesBancarias.regraId,
      nomeExibicao: regrasCategorizacao.nomeExibicao,
      contaNome: contasBancarias.nome,
      contaTipo: contasBancarias.tipo,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .leftJoin(regrasCategorizacao, eq(movimentacoesBancarias.regraId, regrasCategorizacao.id))
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

/** Soma por mês e categoria no intervalo [inicio, fim) — a matéria-prima da DRE. */
export async function somasPorMesECategoria(inicio: string, fim: string): Promise<SomaMensal[]> {
  const linhas = await db
    .select({
      mes: MES,
      categoriaId: movimentacoesBancarias.categoriaId,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(SO_CONTAS, gte(movimentacoesBancarias.data, inicio), lt(movimentacoesBancarias.data, fim)))
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
    .select({ id: categorias.id, nome: categorias.nome, grupo: categorias.grupo, ordem: categorias.ordem })
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
