import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, categorias, contasBancarias, linhasDre, movimentacoesBancarias, pessoas } from "@/db/schema";
import { avaliarAlertas, type AlertaDisparado, type ConfigAlerta, type DadosParaAlertas } from "@/lib/alertas";
import { eCategoriaDeImposto } from "@/lib/relatorios";
import { deslocarMes, ultimosMeses } from "@/lib/periodo";

const EM_CONTA = eq(contasBancarias.tipo, "BANK");
const MES = sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`;

export async function listarAlertas(): Promise<(ConfigAlerta & { id: string })[]> {
  const linhas = await db.select().from(alertas).orderBy(asc(alertas.tipo));
  return linhas.map((l) => ({ id: l.id, tipo: l.tipo, parametros: (l.parametros ?? {}) as Record<string, unknown>, ativo: l.ativo }));
}

/** Lê do banco tudo que o motor de alertas precisa. `hoje` em YYYY-MM-DD. */
export async function dadosParaAlertas(hoje: string): Promise<DadosParaAlertas> {
  const mes = hoje.slice(0, 7);
  const fechados = ultimosMeses(4, deslocarMes(mes, -1)); // os 4 últimos meses fechados
  const inicioFechados = `${fechados[0]}-01`;
  const fimFechados = `${mes}-01`;
  const inicioMes = `${mes}-01`;
  const fimMes = `${deslocarMes(mes, 1)}-01`;
  const dias30 = new Date(`${hoje}T00:00:00Z`);
  dias30.setUTCDate(dias30.getUTCDate() - 30);
  const inicio30 = dias30.toISOString().slice(0, 10);
  const inicio6m = `${deslocarMes(mes, -6)}-01`;

  const [saldo, [ultima], custos, grandes, metas, novos, impostosHist, impostosMes] = await Promise.all([
    db
      .select({ saldo: sql<string>`coalesce(sum(${contasBancarias.saldoCentavos}), 0)` })
      .from(contasBancarias)
      .where(EM_CONTA),
    db
      .select({ data: sql<string | null>`max(${movimentacoesBancarias.data})::text` })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .where(EM_CONTA),
    // Custos por categoria da DRE nos 4 últimos meses fechados.
    db
      .select({
        id: categorias.id,
        nome: categorias.nome,
        mes: MES,
        valor: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
      })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .innerJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
      .innerJoin(linhasDre, eq(categorias.linhaId, linhasDre.id))
      .where(and(EM_CONTA, eq(linhasDre.secao, "dre"), lt(movimentacoesBancarias.valorCentavos, 0), gte(movimentacoesBancarias.data, inicioFechados), lt(movimentacoesBancarias.data, fimFechados)))
      .groupBy(categorias.id, categorias.nome, MES),
    // Sem categoria, os maiores (o motor corta pelo valor configurado).
    db
      .select({ id: movimentacoesBancarias.id, data: movimentacoesBancarias.data, descricao: movimentacoesBancarias.descricao, valorCentavos: movimentacoesBancarias.valorCentavos })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .where(and(EM_CONTA, isNull(movimentacoesBancarias.categoriaId)))
      .orderBy(sql`abs(${movimentacoesBancarias.valorCentavos}) desc`)
      .limit(10),
    // Pessoas com meta e o que receberam neste mês.
    db
      .select({
        id: pessoas.id,
        nome: pessoas.nome,
        metaCentavos: pessoas.metaMensalCentavos,
        pago: sql<string>`coalesce((select -sum(m.valor_centavos) from movimentacoes_bancarias m join contas_bancarias c on c.id = m.conta_id where m.pessoa_id = "pessoas"."id" and c.tipo = 'BANK' and m.valor_centavos < 0 and m.data >= ${inicioMes} and m.data < ${fimMes}), 0)`,
      })
      .from(pessoas)
      .where(and(eq(pessoas.ativa, true), isNotNull(pessoas.metaMensalCentavos))),
    // Contrapartes cuja primeira saída foi nos últimos 30 dias.
    db
      .select({
        nome: sql<string>`coalesce(nullif(trim(${movimentacoesBancarias.contraparte}), ''), ${movimentacoesBancarias.descricao})`,
        primeiraData: sql<string>`min(${movimentacoesBancarias.data})::text`,
        totalCentavos: sql<string>`sum(${movimentacoesBancarias.valorCentavos})`,
        lancamentos: sql<number>`count(*)::int`,
      })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .where(and(EM_CONTA, lt(movimentacoesBancarias.valorCentavos, 0), isNull(movimentacoesBancarias.pessoaId)))
      .groupBy(sql`1`)
      .having(sql`min(${movimentacoesBancarias.data}) >= ${inicio30}`),
    // Impostos: em que dia foram pagos nos últimos 6 meses fechados.
    db
      .select({
        id: categorias.id,
        nome: categorias.nome,
        mes: MES,
        dia: sql<number>`max(extract(day from ${movimentacoesBancarias.data}))::int`,
      })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .innerJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
      .where(and(EM_CONTA, lt(movimentacoesBancarias.valorCentavos, 0), gte(movimentacoesBancarias.data, inicio6m), lt(movimentacoesBancarias.data, inicioMes)))
      .groupBy(categorias.id, categorias.nome, MES),
    db
      .select({ id: categorias.id })
      .from(movimentacoesBancarias)
      .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
      .innerJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
      .where(and(EM_CONTA, lt(movimentacoesBancarias.valorCentavos, 0), gte(movimentacoesBancarias.data, inicioMes), lt(movimentacoesBancarias.data, fimMes)))
      .groupBy(categorias.id),
  ]);

  // Custos: por categoria, o último mês fechado e os três anteriores.
  const porCategoria = new Map<string, { nome: string; porMes: Record<string, number> }>();
  for (const c of custos) {
    const e = porCategoria.get(c.id) ?? { nome: c.nome, porMes: {} };
    e.porMes[c.mes] = Number(c.valor);
    porCategoria.set(c.id, e);
  }
  const ultimoMes = fechados[fechados.length - 1];
  const categoriasDados = [...porCategoria.entries()].map(([id, e]) => ({
    id,
    nome: e.nome,
    ultimoMes,
    ultimo: e.porMes[ultimoMes] ?? 0,
    anteriores: fechados.slice(0, -1).map((m) => e.porMes[m] ?? 0),
  }));

  // Impostos: dia habitual = mediana dos dias de pagamento.
  const porImposto = new Map<string, { nome: string; dias: number[] }>();
  for (const i of impostosHist) {
    if (!eCategoriaDeImposto(i.nome)) continue;
    const e = porImposto.get(i.id) ?? { nome: i.nome, dias: [] };
    e.dias.push(i.dia);
    porImposto.set(i.id, e);
  }
  const pagosNoMes = new Set(impostosMes.map((i) => i.id));
  const impostos = [...porImposto.entries()].map(([id, e]) => {
    const dias = [...e.dias].sort((a, b) => a - b);
    return { id, nome: e.nome, diaHabitual: dias[Math.floor(dias.length / 2)], mesesComPagamento: dias.length, pagoNoMes: pagosNoMes.has(id) };
  });

  return {
    hoje,
    saldoCentavos: Number(saldo[0]?.saldo ?? 0),
    ultimaData: ultima?.data ?? null,
    categorias: categoriasDados,
    semCategoriaGrandes: grandes,
    pessoasComMeta: metas.map((m) => ({ id: m.id, nome: m.nome, metaCentavos: m.metaCentavos!, pagoNoMes: Number(m.pago) })),
    fornecedoresNovos: novos.map((n) => ({ nome: n.nome, primeiraData: n.primeiraData, totalCentavos: Number(n.totalCentavos), lancamentos: n.lancamentos })),
    impostos,
  };
}

/** Os alertas disparados agora. */
export async function alertasDisparados(hoje: string): Promise<AlertaDisparado[]> {
  const [configs, dados] = await Promise.all([listarAlertas(), dadosParaAlertas(hoje)]);
  return avaliarAlertas(configs, dados);
}
