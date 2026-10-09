import { NextResponse } from "next/server";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { buscarContas, buscarItem, PluggyErro } from "@/lib/pluggy/client";
import { categoriasParaDre, listarLinhasDre, somasPorMesECategoria } from "@/db/queries/financeiro";
import { montarDre } from "@/lib/dre";
import { deslocarMes, mesValido } from "@/lib/periodo";
import {
  categorias,
  conexoesBancarias,
  contasBancarias,
  movimentacoesBancarias,
  regrasCategorizacao,
  usuarios,
} from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Saúde do sistema para quem dá suporte: banco responde? o banco da Safran
 * está conectado e sincronizando? quanto do extrato já tem categoria?
 *
 * Protegido pelo CRON_SECRET (na query, `?segredo=`, para dar para abrir no
 * navegador). Só devolve contagens e status — nenhum valor em reais, nome de
 * cliente ou dado da conta.
 *
 * Com `&detalhe=1`, inclui o que falta categorizar agrupado (ver
 * detalharPendencias) — esse modo traz totais em reais e nomes de
 * contrapartes.
 *
 * Com `&dre=YYYY-MM`, inclui a DRE daquele mês: total por linha e por
 * categoria, na estrutura configurada (só números).
 *
 * Com `&item=<id>`, pergunta também à Pluggy se as credenciais da Safran
 * enxergam aquela conexão (só leitura, nada é gravado). Serve para saber se
 * uma conexão do Meu Pluggy já foi liberada para a aplicação.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Com `&detalhe=1`: o que ainda falta categorizar, agrupado, para desenhar
 * regras em lote — descrições mais frequentes (pelas três primeiras palavras,
 * que é onde o banco põe o tipo do lançamento), fornecedores com CNPJ nas
 * saídas, contrapartes (só as duas primeiras palavras do nome), os maiores
 * lançamentos e o total de entradas e saídas por mês (para conferir o sinal
 * contra o faturamento).
 */
async function detalharPendencias() {
  const SEM = sql`${movimentacoesBancarias.categoriaId} is null`;
  const sentido = sql<string>`case when ${movimentacoesBancarias.valorCentavos} >= 0 then 'entrada' else 'saida' end`;
  // Sem barra invertida: num template literal "\s" vira "s" antes de chegar ao Postgres.
  const normalizada = sql`regexp_replace(trim(${movimentacoesBancarias.descricao}), '[[:space:]]+', ' ', 'g')`;
  const prefixo = sql<string>`lower(trim(concat_ws(' ', split_part(${normalizada}, ' ', 1), split_part(${normalizada}, ' ', 2), split_part(${normalizada}, ' ', 3))))`;
  const tipoDoc = sql<string>`case
    when ${movimentacoesBancarias.contraparteDocumento} ~ '^[0-9]{14}$' then 'cnpj'
    when ${movimentacoesBancarias.contraparteDocumento} ~ '^[0-9]{11}$' then 'cpf'
    when ${movimentacoesBancarias.contraparteDocumento} is null then 'sem'
    else 'mascarado' end`;

  // Duas primeiras palavras do nome: o bastante para virar regra, sem sobrenome completo.
  const nome = sql`regexp_replace(trim(coalesce(${movimentacoesBancarias.contraparte}, '')), '[[:space:]]+', ' ', 'g')`;
  const inicioNome = sql<string>`nullif(lower(trim(concat_ws(' ', split_part(${nome}, ' ', 1), split_part(${nome}, ' ', 2)))), '')`;

  // Quando as três primeiras palavras são só o tipo do lançamento ("transferência
  // pix enviada"), o nome de quem recebeu vem depois: abre até a quinta.
  const prefixoLongo = sql<string>`lower(trim(concat_ws(' ', ${sql.join(
    [1, 2, 3, 4, 5].map((n) => sql`split_part(${normalizada}, ' ', ${sql.raw(String(n))})`),
    sql`, `
  )})))`;
  const GENERICOS = [
    "pix enviado",
    "pix recebido",
    "transferência pix",
    "transferência enviada",
    "transferência cancelada",
    "transferência recebida",
    "pagamento com",
    "pagamento de",
    "compra de",
  ];
  const ehGenerico = sql`(${sql.join(
    GENERICOS.map((g) => sql`lower(${normalizada}) like ${g + " %"}`),
    sql` or `
  )})`;

  const [porPrefixo, fornecedores, porMes, contrapartes, maiores, genericos] = await Promise.all([
    db
      .select({
        inicioDescricao: prefixo,
        sentido,
        meio: movimentacoesBancarias.meio,
        documento: tipoDoc,
        quantidade: sql<number>`count(*)::int`,
        totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      })
      .from(movimentacoesBancarias)
      .where(SEM)
      .groupBy(sql`1, 2, 3, 4`)
      .orderBy(sql`5 desc`)
      .limit(60),
    db
      .select({
        contraparte: movimentacoesBancarias.contraparte,
        cnpj: movimentacoesBancarias.contraparteDocumento,
        quantidade: sql<number>`count(*)::int`,
        totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      })
      .from(movimentacoesBancarias)
      .where(sql`${SEM} and ${movimentacoesBancarias.valorCentavos} < 0 and ${movimentacoesBancarias.contraparteDocumento} ~ '^[0-9]{14}$'`)
      .groupBy(movimentacoesBancarias.contraparte, movimentacoesBancarias.contraparteDocumento)
      .orderBy(sql`3 desc`)
      .limit(40),
    db
      .select({
        mes: sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`,
        entradasCentavos: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${movimentacoesBancarias.valorCentavos} > 0), 0)`,
        saidasCentavos: sql<string>`coalesce(sum(${movimentacoesBancarias.valorCentavos}) filter (where ${movimentacoesBancarias.valorCentavos} < 0), 0)`,
        semTipo: sql<number>`count(*) filter (where ${movimentacoesBancarias.tipo} is null)::int`,
      })
      .from(movimentacoesBancarias)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        inicioNome,
        sentido,
        documento: tipoDoc,
        quantidade: sql<number>`count(*)::int`,
        totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      })
      .from(movimentacoesBancarias)
      .where(SEM)
      .groupBy(sql`1, 2, 3`)
      .orderBy(sql`4 desc`)
      .limit(80),
    db
      .select({
        data: sql<string>`${movimentacoesBancarias.data}::text`,
        inicioDescricao: prefixo,
        inicioNome,
        valorCentavos: movimentacoesBancarias.valorCentavos,
      })
      .from(movimentacoesBancarias)
      .where(SEM)
      .orderBy(sql`abs(${movimentacoesBancarias.valorCentavos}) desc`)
      .limit(25),
    db
      .select({
        descricao: prefixoLongo,
        sentido,
        quantidade: sql<number>`count(*)::int`,
        totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      })
      .from(movimentacoesBancarias)
      .where(sql`${SEM} and ${ehGenerico}`)
      .groupBy(sql`1, 2`)
      .orderBy(sql`3 desc`)
      .limit(120),
  ]);

  const num = <T extends { totalCentavos: string }>(l: T) => ({ ...l, totalCentavos: Number(l.totalCentavos) });
  return {
    porPrefixo: porPrefixo.map(num),
    contrapartes: contrapartes.map(num),
    genericos: genericos.map(num),
    maiores,
    fornecedores: fornecedores.map(num),
    porMes: porMes.map((m) => ({
      ...m,
      entradasCentavos: Number(m.entradasCentavos),
      saidasCentavos: Number(m.saidasCentavos),
    })),
  };
}

/** Com `&dre=YYYY-MM`: total por linha e por categoria do mês, como a tela da DRE monta. */
async function resumirDre(mes: string) {
  const [linhas, categorias, somas] = await Promise.all([
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(`${mes}-01`, `${deslocarMes(mes, 1)}-01`),
  ]);
  const dre = montarDre([mes], linhas, categorias, somas);
  return {
    mes,
    linhas: dre.linhas.map((l) => ({
      linha: l.linha.nome,
      tipo: l.linha.tipo,
      secao: l.linha.secao,
      totalCentavos: l.total,
      categorias: l.categorias.map((c) => ({ categoria: c.categoria.nome, totalCentavos: c.total })),
    })),
    resultadoCentavos: dre.resultado.total,
    semCategoriaCentavos: dre.semCategoria.total,
    variacaoCaixaCentavos: dre.variacaoCaixa.total,
  };
}

async function testarItemNaPluggy(itemId: string) {
  try {
    const item = await buscarItem(itemId);
    const contas = await buscarContas(itemId);
    return {
      enxerga: true,
      instituicao: item.connector?.name ?? null,
      status: item.status,
      atualizadoEm: item.lastUpdatedAt ?? null,
      contas: contas.map((c) => ({ tipo: c.type, subtipo: c.subtype ?? null })),
    };
  } catch (err) {
    return {
      enxerga: false,
      status: err instanceof PluggyErro ? err.status : null,
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || new URL(request.url).searchParams.get("segredo") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const itemParam = new URL(request.url).searchParams.get("item");
  const pluggy = itemParam && UUID.test(itemParam) ? await testarItemNaPluggy(itemParam.toLowerCase()) : undefined;

  const inicio = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latenciaMs = Date.now() - inicio;

    const [conexoes, contas, porMes, [totais], [contagens]] = await Promise.all([
      db
        .select({
          instituicao: conexoesBancarias.instituicao,
          status: conexoesBancarias.status,
          dadosAtualizadosEm: conexoesBancarias.dadosAtualizadosEm,
          ultimoSyncEm: conexoesBancarias.ultimoSyncEm,
          ultimoSyncOk: conexoesBancarias.ultimoSyncOk,
          ultimoSyncDetalhe: conexoesBancarias.ultimoSyncDetalhe,
          criadaEm: conexoesBancarias.createdAt,
        })
        .from(conexoesBancarias)
        .orderBy(asc(conexoesBancarias.createdAt)),
      db
        .select({ nome: contasBancarias.nome, tipo: contasBancarias.tipo, subtipo: contasBancarias.subtipo })
        .from(contasBancarias),
      db
        .select({
          mes: sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`,
          quantidade: sql<number>`count(*)::int`,
          semCategoria: sql<number>`count(*) filter (where ${movimentacoesBancarias.categoriaId} is null)::int`,
        })
        .from(movimentacoesBancarias)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db
        .select({
          total: sql<number>`count(*)::int`,
          semCategoria: sql<number>`count(*) filter (where ${movimentacoesBancarias.categoriaId} is null)::int`,
          porRegra: sql<number>`count(*) filter (where ${movimentacoesBancarias.categorizadaPor} = 'regra')::int`,
          manual: sql<number>`count(*) filter (where ${movimentacoesBancarias.categorizadaPor} = 'manual')::int`,
          primeiraData: sql<string | null>`min(${movimentacoesBancarias.data})::text`,
          ultimaData: sql<string | null>`max(${movimentacoesBancarias.data})::text`,
        })
        .from(movimentacoesBancarias),
      db
        .select({
          usuarios: sql<number>`(select count(*)::int from ${usuarios})`,
          categorias: sql<number>`(select count(*)::int from ${categorias})`,
          regras: sql<number>`(select count(*)::int from ${regrasCategorizacao})`,
        })
        .from(sql`(select 1) as um`),
    ]);

    const detalhe = new URL(request.url).searchParams.get("detalhe") === "1" ? await detalharPendencias() : undefined;
    const mesDre = new URL(request.url).searchParams.get("dre");
    const dre = mesDre && mesValido(mesDre) ? await resumirDre(mesDre) : undefined;

    return NextResponse.json({
      ...(pluggy ? { pluggy } : {}),
      ...(detalhe ? { detalhe } : {}),
      ...(dre ? { dre } : {}),
      banco: { ok: true, latenciaMs },
      conexoes,
      contas,
      movimentacoes: { ...totais, porMes },
      ...contagens,
    });
  } catch (err) {
    console.error("[diagnostico]", err);
    const causa = (err as { cause?: { message?: string } })?.cause?.message;
    return NextResponse.json(
      {
        ...(pluggy ? { pluggy } : {}),
        banco: { ok: false, latenciaMs: Date.now() - inicio, erro: causa ?? (err instanceof Error ? err.message : String(err)) },
      },
      { status: 500 }
    );
  }
}
