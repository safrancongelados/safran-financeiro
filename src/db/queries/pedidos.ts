/** Leituras dos pedidos do Cardápio Web: estado, mapeamento e as somas que alimentam o rateio. */
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, integracaoCardapioWeb, itensPedidoCardapioWeb, mapeamentoCardapioWeb, pedidosCardapioWeb } from "@/db/schema";
import type { VendaPorPedidos } from "@/lib/rateio";

const MES = sql<string>`to_char(${pedidosCardapioWeb.data}, 'YYYY-MM')`;
/** Cancelado não vendeu. Os demais status do histórico são pedidos entregues. */
const VENDIDOS = sql`${pedidosCardapioWeb.status} <> 'canceled'`;

export async function estadoIntegracao() {
  const [estado] = await db.select().from(integracaoCardapioWeb).limit(1);
  return estado ?? null;
}

/** Há pedidos gravados? (sem isso, a DRE nem tenta ratear) */
export async function temPedidos(): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pedidosCardapioWeb);
  return (r?.n ?? 0) > 0;
}

export async function listarMapeamentos() {
  return db
    .select({
      id: mapeamentoCardapioWeb.id,
      categoriaCw: mapeamentoCardapioWeb.categoriaCw,
      categoriaId: mapeamentoCardapioWeb.categoriaId,
      categoriaNome: categorias.nome,
    })
    .from(mapeamentoCardapioWeb)
    .leftJoin(categorias, eq(mapeamentoCardapioWeb.categoriaId, categorias.id))
    .orderBy(asc(mapeamentoCardapioWeb.categoriaCw));
}

export type Mapeamento = Awaited<ReturnType<typeof listarMapeamentos>>[number];

/**
 * As categorias rateadas pelos pedidos, na ordem do plano de contas. A
 * primeira é o destino padrão (pedidos sem mapeamento e itens sem categoria).
 */
export async function categoriasRateadas(): Promise<{ ids: Set<string>; padraoId: string | null }> {
  const linhas = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(eq(categorias.rateadaPorPedidos, true))
    .orderBy(asc(categorias.ordem), asc(categorias.nome));
  return { ids: new Set(linhas.map((l) => l.id)), padraoId: linhas[0]?.id ?? null };
}

/**
 * Quanto os pedidos venderam por mês e categoria da DRE, no intervalo
 * [inicio, fim) — a proporção do rateio. Item sem categoria no cardápio, ou
 * categoria sem mapeamento, sai com categoria nula.
 */
export async function vendasPorMesECategoriaDre(inicio: string, fim: string): Promise<VendaPorPedidos[]> {
  const linhas = await db
    .select({
      mes: MES,
      categoriaId: mapeamentoCardapioWeb.categoriaId,
      centavos: sql<string>`sum(${itensPedidoCardapioWeb.totalCentavos})`,
    })
    .from(itensPedidoCardapioWeb)
    .innerJoin(pedidosCardapioWeb, eq(itensPedidoCardapioWeb.pedidoId, pedidosCardapioWeb.id))
    .leftJoin(mapeamentoCardapioWeb, eq(itensPedidoCardapioWeb.categoriaCw, mapeamentoCardapioWeb.categoriaCw))
    .where(and(VENDIDOS, gte(pedidosCardapioWeb.data, inicio), lt(pedidosCardapioWeb.data, fim)))
    .groupBy(MES, mapeamentoCardapioWeb.categoriaId);
  return linhas.map((l) => ({ mes: l.mes, categoriaId: l.categoriaId, centavos: Number(l.centavos) }));
}

export interface ResumoPedidosDoMes {
  mes: string;
  pedidos: number;
  cancelados: number;
  totalCentavos: number;
  itensCentavos: number;
  taxaEntregaCentavos: number;
}

/** Pedidos por mês no intervalo: quantidade, faturado, itens, entrega. */
export async function resumoPedidosPorMes(inicio: string, fim: string): Promise<ResumoPedidosDoMes[]> {
  const linhas = await db
    .select({
      mes: MES,
      pedidos: sql<number>`count(*) filter (where ${VENDIDOS})::int`,
      cancelados: sql<number>`count(*) filter (where ${pedidosCardapioWeb.status} = 'canceled')::int`,
      total: sql<string>`coalesce(sum(${pedidosCardapioWeb.totalCentavos}) filter (where ${VENDIDOS}), 0)`,
      itens: sql<string>`coalesce(sum(${pedidosCardapioWeb.itensCentavos}) filter (where ${VENDIDOS}), 0)`,
      entrega: sql<string>`coalesce(sum(${pedidosCardapioWeb.taxaEntregaCentavos}) filter (where ${VENDIDOS}), 0)`,
    })
    .from(pedidosCardapioWeb)
    .where(and(gte(pedidosCardapioWeb.data, inicio), lt(pedidosCardapioWeb.data, fim)))
    .groupBy(MES)
    .orderBy(MES);
  return linhas.map((l) => ({
    mes: l.mes,
    pedidos: l.pedidos,
    cancelados: l.cancelados,
    totalCentavos: Number(l.total),
    itensCentavos: Number(l.itens),
    taxaEntregaCentavos: Number(l.entrega),
  }));
}

export interface VendaPorCategoriaCw {
  categoriaCw: string | null;
  quantidade: number;
  centavos: number;
}

/** O que cada categoria do cardápio vendeu no intervalo (itens de pedidos não cancelados). */
export async function vendasPorCategoriaCw(inicio: string, fim: string): Promise<VendaPorCategoriaCw[]> {
  const linhas = await db
    .select({
      categoriaCw: itensPedidoCardapioWeb.categoriaCw,
      quantidade: sql<string>`coalesce(sum(${itensPedidoCardapioWeb.quantidade}), 0)`,
      centavos: sql<string>`coalesce(sum(${itensPedidoCardapioWeb.totalCentavos}), 0)`,
    })
    .from(itensPedidoCardapioWeb)
    .innerJoin(pedidosCardapioWeb, eq(itensPedidoCardapioWeb.pedidoId, pedidosCardapioWeb.id))
    .where(and(VENDIDOS, gte(pedidosCardapioWeb.data, inicio), lt(pedidosCardapioWeb.data, fim)))
    .groupBy(itensPedidoCardapioWeb.categoriaCw)
    .orderBy(desc(sql`sum(${itensPedidoCardapioWeb.totalCentavos})`));
  return linhas.map((l) => ({ categoriaCw: l.categoriaCw, quantidade: Number(l.quantidade), centavos: Number(l.centavos) }));
}

/** Os últimos pedidos gravados, para conferir que o sync está vivo. */
export async function pedidosRecentes(limite: number) {
  return db
    .select({
      id: pedidosCardapioWeb.id,
      pedidoId: pedidosCardapioWeb.pedidoId,
      displayId: pedidosCardapioWeb.displayId,
      status: pedidosCardapioWeb.status,
      data: pedidosCardapioWeb.data,
      clienteNome: pedidosCardapioWeb.clienteNome,
      meioPagamento: pedidosCardapioWeb.meioPagamento,
      totalCentavos: pedidosCardapioWeb.totalCentavos,
    })
    .from(pedidosCardapioWeb)
    .orderBy(desc(pedidosCardapioWeb.criadoEm))
    .limit(limite);
}
