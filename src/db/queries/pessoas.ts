import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, contasBancarias, movimentacoesBancarias, pessoas, visoesSalvas } from "@/db/schema";

export type PessoaLinha = typeof pessoas.$inferSelect & {
  categoriaNome: string | null;
  /** Nos últimos 12 meses, só em conta (não cartão): o que saiu para ela (negativo) ou entrou dela. */
  lancamentos: number;
  totalCentavos: number;
  ultimaData: string | null;
};

/** O cadastro com o resumo dos últimos 12 meses de cada pessoa. `inicio` em YYYY-MM-DD. */
export async function listarPessoas(inicio: string): Promise<PessoaLinha[]> {
  const resumo = db
    .select({
      pessoaId: movimentacoesBancarias.pessoaId,
      lancamentos: sql<number>`count(*)::int`.as("lancamentos"),
      totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`.as("total_centavos"),
      ultimaData: sql<string | null>`max(${movimentacoesBancarias.data})::text`.as("ultima_data"),
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(eq(contasBancarias.tipo, "BANK"), gte(movimentacoesBancarias.data, inicio)))
    .groupBy(movimentacoesBancarias.pessoaId)
    .as("resumo");

  const linhas = await db
    .select({
      pessoa: pessoas,
      categoriaNome: categorias.nome,
      lancamentos: resumo.lancamentos,
      totalCentavos: resumo.totalCentavos,
      ultimaData: resumo.ultimaData,
    })
    .from(pessoas)
    .leftJoin(categorias, eq(pessoas.categoriaId, categorias.id))
    .leftJoin(resumo, eq(resumo.pessoaId, pessoas.id))
    .orderBy(asc(pessoas.tipo), asc(pessoas.nome));

  return linhas.map((l) => ({
    ...l.pessoa,
    categoriaNome: l.categoriaNome,
    lancamentos: l.lancamentos ?? 0,
    totalCentavos: Number(l.totalCentavos ?? 0),
    ultimaData: l.ultimaData ?? null,
  }));
}

export async function buscarPessoa(id: string) {
  const [p] = await db.select().from(pessoas).where(eq(pessoas.id, id)).limit(1);
  return p;
}

/** Pessoas ativas para seletores (vincular, filtrar), na ordem do nome. */
export async function listarPessoasAtivas(): Promise<{ id: string; nome: string; tipo: string }[]> {
  return db
    .select({ id: pessoas.id, nome: pessoas.nome, tipo: pessoas.tipo })
    .from(pessoas)
    .where(eq(pessoas.ativa, true))
    .orderBy(asc(pessoas.nome));
}

export interface MesDaPessoa {
  mes: string;
  lancamentos: number;
  entradasCentavos: number;
  saidasCentavos: number;
}

/** Por mês, o que entrou dela e saiu para ela, em conta. Intervalo [inicio, fim). */
export async function resumoMensalDaPessoa(pessoaId: string, inicio: string, fim: string): Promise<MesDaPessoa[]> {
  const linhas = await db
    .select({
      mes: sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`,
      lancamentos: sql<number>`count(*)::int`,
      entradas: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${movimentacoesBancarias.valorCentavos} > 0), 0)`,
      saidas: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${movimentacoesBancarias.valorCentavos} < 0), 0)`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(
      and(
        eq(movimentacoesBancarias.pessoaId, pessoaId),
        eq(contasBancarias.tipo, "BANK"),
        gte(movimentacoesBancarias.data, inicio),
        lt(movimentacoesBancarias.data, fim)
      )
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return linhas.map((l) => ({
    mes: l.mes,
    lancamentos: l.lancamentos,
    entradasCentavos: Number(l.entradas),
    saidasCentavos: Number(l.saidas),
  }));
}

/** Por categoria, o total da pessoa no intervalo — para ver se tudo está na categoria certa. */
export async function porCategoriaDaPessoa(pessoaId: string, inicio: string, fim: string) {
  const linhas = await db
    .select({
      categoriaId: movimentacoesBancarias.categoriaId,
      categoriaNome: categorias.nome,
      lancamentos: sql<number>`count(*)::int`,
      totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
    })
    .from(movimentacoesBancarias)
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .where(and(eq(movimentacoesBancarias.pessoaId, pessoaId), gte(movimentacoesBancarias.data, inicio), lt(movimentacoesBancarias.data, fim)))
    .groupBy(movimentacoesBancarias.categoriaId, categorias.nome)
    .orderBy(sql`abs(sum(${movimentacoesBancarias.valorCentavos})) desc`);
  return linhas.map((l) => ({ ...l, totalCentavos: Number(l.totalCentavos) }));
}

export async function ultimosLancamentosDaPessoa(pessoaId: string, limite: number) {
  return db
    .select({
      id: movimentacoesBancarias.id,
      data: movimentacoesBancarias.data,
      descricao: movimentacoesBancarias.descricao,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      categoriaNome: categorias.nome,
    })
    .from(movimentacoesBancarias)
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .where(eq(movimentacoesBancarias.pessoaId, pessoaId))
    .orderBy(desc(movimentacoesBancarias.data), desc(movimentacoesBancarias.createdAt))
    .limit(limite);
}

export async function listarVisoesSalvas() {
  return db.select().from(visoesSalvas).orderBy(asc(visoesSalvas.ordem), asc(visoesSalvas.createdAt));
}
