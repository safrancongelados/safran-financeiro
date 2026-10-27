import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditoria, categorias, contasBancarias, linhasDre, movimentacoesBancarias, pessoas, usuarios } from "@/db/schema";
import type { SomaPorChave } from "@/lib/relatorios";

const EM_CONTA = eq(contasBancarias.tipo, "BANK");
const MES = sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`;

function noIntervalo(inicio: string, fim: string): SQL {
  return and(gte(movimentacoesBancarias.data, inicio), lt(movimentacoesBancarias.data, fim))!;
}

/** Saídas por pessoa cadastrada (funcionário ou sócio) e mês. A chave é o id da pessoa. */
export async function pessoalPorMes(inicio: string, fim: string): Promise<SomaPorChave[]> {
  const linhas = await db
    .select({
      chave: movimentacoesBancarias.pessoaId,
      mes: MES,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      lancamentos: sql<number>`count(*)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .innerJoin(pessoas, eq(movimentacoesBancarias.pessoaId, pessoas.id))
    .where(and(EM_CONTA, noIntervalo(inicio, fim), inArray(pessoas.tipo, ["funcionario", "socio"])))
    .groupBy(movimentacoesBancarias.pessoaId, MES);
  return linhas.map((l) => ({ chave: l.chave!, mes: l.mes, valorCentavos: Number(l.valorCentavos), lancamentos: l.lancamentos }));
}

/**
 * Lançamentos de pessoal sem pessoa cadastrada: caem em categoria de
 * pessoal mas ninguém sabe de quem são. Agrupados pela contraparte (ou
 * descrição, sem ela). A chave é o texto.
 */
export async function pessoalSemCadastroPorMes(inicio: string, fim: string, categoriaIds: string[]): Promise<SomaPorChave[]> {
  if (categoriaIds.length === 0) return [];
  const chave = sql<string>`coalesce(nullif(trim(${movimentacoesBancarias.contraparte}), ''), ${movimentacoesBancarias.descricao})`;
  const linhas = await db
    .select({
      chave,
      mes: MES,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      lancamentos: sql<number>`count(*)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .where(and(EM_CONTA, noIntervalo(inicio, fim), isNull(movimentacoesBancarias.pessoaId), inArray(movimentacoesBancarias.categoriaId, categoriaIds)))
    .groupBy(chave, MES);
  return linhas.map((l) => ({ chave: l.chave, mes: l.mes, valorCentavos: Number(l.valorCentavos), lancamentos: l.lancamentos }));
}

/** Saídas por categoria da DRE e mês. A chave é o id da categoria. */
export async function custosPorCategoriaMes(inicio: string, fim: string): Promise<SomaPorChave[]> {
  const linhas = await db
    .select({
      chave: movimentacoesBancarias.categoriaId,
      mes: MES,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      lancamentos: sql<number>`count(*)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .innerJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .innerJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
    .where(and(EM_CONTA, noIntervalo(inicio, fim), eq(linhasDre.secao, "dre"), lt(movimentacoesBancarias.valorCentavos, 0)))
    .groupBy(movimentacoesBancarias.categoriaId, MES);
  return linhas.map((l) => ({ chave: l.chave!, mes: l.mes, valorCentavos: Number(l.valorCentavos), lancamentos: l.lancamentos }));
}

export interface TopContraparte {
  categoriaId: string;
  nome: string;
  pessoaId: string | null;
  totalCentavos: number;
  lancamentos: number;
}

/** Por categoria, quem mais recebeu no período: pessoa cadastrada, senão contraparte, senão descrição. */
export async function topContrapartesPorCategoria(inicio: string, fim: string, porCategoria = 5): Promise<TopContraparte[]> {
  const nome = sql<string>`coalesce(${pessoas.nome}, nullif(trim(${movimentacoesBancarias.contraparte}), ''), ${movimentacoesBancarias.descricao})`;
  const linhas = await db
    .select({
      categoriaId: movimentacoesBancarias.categoriaId,
      nome,
      pessoaId: movimentacoesBancarias.pessoaId,
      totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      lancamentos: sql<number>`count(*)::int`,
      posicao: sql<number>`row_number() over (partition by ${movimentacoesBancarias.categoriaId} order by sum(${movimentacoesBancarias.valorCentavos}) asc)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(pessoas, eq(movimentacoesBancarias.pessoaId, pessoas.id))
    .where(and(EM_CONTA, noIntervalo(inicio, fim), isNotNull(movimentacoesBancarias.categoriaId), lt(movimentacoesBancarias.valorCentavos, 0)))
    .groupBy(movimentacoesBancarias.categoriaId, nome, movimentacoesBancarias.pessoaId);
  return linhas
    .filter((l) => l.posicao <= porCategoria)
    .map((l) => ({ categoriaId: l.categoriaId!, nome: l.nome, pessoaId: l.pessoaId, totalCentavos: Number(l.totalCentavos), lancamentos: l.lancamentos }));
}

/**
 * Saídas por fornecedor e mês, só nas categorias da DRE (fora ficam sócios,
 * investimentos e transferências). A chave é "pessoa:<id>" ou "texto:<nome>".
 */
export async function fornecedoresPorMes(inicio: string, fim: string): Promise<(SomaPorChave & { nome: string; pessoaId: string | null; documento: string | null; categoriaNome: string | null })[]> {
  const nome = sql<string>`coalesce(${pessoas.nome}, nullif(trim(${movimentacoesBancarias.contraparte}), ''), ${movimentacoesBancarias.descricao})`;
  const chave = sql<string>`coalesce('pessoa:' || ${movimentacoesBancarias.pessoaId}::text, 'texto:' || lower(${nome}))`;
  const linhas = await db
    .select({
      chave,
      nome: sql<string>`min(${nome})`,
      pessoaId: movimentacoesBancarias.pessoaId,
      documento: sql<string | null>`max(${movimentacoesBancarias.contraparteDocumento})`,
      categoriaNome: sql<string | null>`mode() within group (order by ${categorias.nome})`,
      mes: MES,
      valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      lancamentos: sql<number>`count(*)::int`,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(pessoas, eq(movimentacoesBancarias.pessoaId, pessoas.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .leftJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
    .where(
      and(
        EM_CONTA,
        noIntervalo(inicio, fim),
        lt(movimentacoesBancarias.valorCentavos, 0),
        or(isNull(movimentacoesBancarias.categoriaId), eq(linhasDre.secao, "dre")),
        // Sócios e funcionários não são fornecedores.
        or(isNull(pessoas.tipo), inArray(pessoas.tipo, ["fornecedor", "cliente", "outro"]))
      )
    )
    .groupBy(chave, movimentacoesBancarias.pessoaId, MES);
  return linhas.map((l) => ({
    chave: l.chave,
    nome: l.nome,
    pessoaId: l.pessoaId,
    documento: l.documento,
    categoriaNome: l.categoriaNome,
    mes: l.mes,
    valorCentavos: Number(l.valorCentavos),
    lancamentos: l.lancamentos,
  }));
}

/** Entradas na linha de receita (o primeiro grupo da DRE) por mês, para a alíquota efetiva dos impostos. */
export async function receitaPorMes(inicio: string, fim: string): Promise<Record<string, number>> {
  const [primeira] = await db
    .select({ id: linhasDre.id })
    .from(linhasDre)
    .where(and(eq(linhasDre.secao, "dre"), eq(linhasDre.tipo, "grupo")))
    .orderBy(asc(linhasDre.ordem))
    .limit(1);
  if (!primeira) return {};
  const linhas = await db
    .select({ mes: MES, valorCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})` })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .innerJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .where(and(EM_CONTA, noIntervalo(inicio, fim), eq(categorias.linhaId, primeira.id)))
    .groupBy(MES);
  return Object.fromEntries(linhas.map((l) => [l.mes, Number(l.valorCentavos)]));
}

/** As categorias com a linha em que somam, para os relatórios decidirem o que é pessoal e o que é imposto. */
export async function categoriasComLinha() {
  return db
    .select({ id: categorias.id, nome: categorias.nome, linhaNome: linhasDre.nome, secao: linhasDre.secao, ordem: categorias.ordem, linhaOrdem: linhasDre.ordem })
    .from(categorias)
    .innerJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
    .orderBy(asc(linhasDre.ordem), asc(categorias.ordem), asc(categorias.nome));
}

// ── Caixa de revisão ───────────────────────────────────────────────────────

/** Tudo em conta sem categoria, para agrupar e sugerir. */
export async function semCategoriaParaRevisar() {
  return db
    .select({
      id: movimentacoesBancarias.id,
      data: movimentacoesBancarias.data,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      categoriaId: movimentacoesBancarias.categoriaId,
      pessoaNome: pessoas.nome,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(pessoas, eq(movimentacoesBancarias.pessoaId, pessoas.id))
    .where(and(EM_CONTA, isNull(movimentacoesBancarias.categoriaId)))
    .orderBy(desc(movimentacoesBancarias.data));
}

/** O que já tem categoria: a memória de onde as sugestões saem. */
export async function categorizadasParaSugerir() {
  const linhas = await db
    .select({
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      categoriaId: movimentacoesBancarias.categoriaId,
    })
    .from(movimentacoesBancarias)
    .where(isNotNull(movimentacoesBancarias.categoriaId));
  return linhas.map((l) => ({ ...l, categoriaId: l.categoriaId! }));
}

// ── Busca global ───────────────────────────────────────────────────────────

/** Contrapartes que contêm o texto, com total e quantidade desde `inicio`. */
export async function buscarContrapartes(q: string, inicio: string, limite = 6) {
  const nome = sql<string>`coalesce(nullif(trim(${movimentacoesBancarias.contraparte}), ''), ${movimentacoesBancarias.descricao})`;
  return db
    .select({
      nome,
      lancamentos: sql<number>`count(*)::int`,
      totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
    })
    .from(movimentacoesBancarias)
    .where(and(gte(movimentacoesBancarias.data, inicio), or(ilike(movimentacoesBancarias.contraparte, `%${q}%`), ilike(movimentacoesBancarias.descricao, `%${q}%`), ilike(movimentacoesBancarias.nomeExibicao, `%${q}%`))))
    .groupBy(nome)
    .orderBy(sql`count(*) desc`)
    .limit(limite);
}

export async function buscarPessoasPorNome(q: string, limite = 5) {
  return db
    .select({ id: pessoas.id, nome: pessoas.nome, tipo: pessoas.tipo })
    .from(pessoas)
    .where(ilike(pessoas.nome, `%${q}%`))
    .orderBy(asc(pessoas.nome))
    .limit(limite);
}

export async function buscarCategoriasPorNome(q: string, limite = 5) {
  return db
    .select({ id: categorias.id, nome: categorias.nome })
    .from(categorias)
    .where(and(eq(categorias.ativa, true), ilike(categorias.nome, `%${q}%`)))
    .orderBy(asc(categorias.nome))
    .limit(limite);
}

// ── Histórico ──────────────────────────────────────────────────────────────

export async function listarAuditoria(opcoes: { q?: string; alvoTipo?: string; alvoId?: string; limite?: number }) {
  const condicoes: (SQL | undefined)[] = [
    opcoes.alvoTipo ? eq(auditoria.alvoTipo, opcoes.alvoTipo) : undefined,
    opcoes.alvoId ? eq(auditoria.alvoId, opcoes.alvoId) : undefined,
    opcoes.q
      ? or(ilike(auditoria.usuarioNome, `%${opcoes.q}%`), ilike(auditoria.acao, `%${opcoes.q}%`), sql`${auditoria.detalhe}::text ilike ${`%${opcoes.q}%`}`)
      : undefined,
  ];
  return db
    .select()
    .from(auditoria)
    .where(and(...condicoes))
    .orderBy(desc(auditoria.createdAt))
    .limit(opcoes.limite ?? 200);
}

// ── Usuários ───────────────────────────────────────────────────────────────

export async function listarUsuarios() {
  return db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: usuarios.papel, ativo: usuarios.ativo, createdAt: usuarios.createdAt })
    .from(usuarios)
    .orderBy(asc(usuarios.nome));
}
