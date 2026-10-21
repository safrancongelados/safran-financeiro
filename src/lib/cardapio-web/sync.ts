/**
 * Sincronização dos pedidos do Cardápio Web: lê da API e grava no banco.
 *
 * Idempotente — pedido e item são upsert pelo ID do Cardápio Web. O detalhe
 * (itens, pagamento) é uma requisição por pedido, então cada rodada busca no
 * máximo `LIMITE_DETALHES` pedidos novos ou alterados e guarda até onde o
 * histórico já está coberto; rodando de novo (cron, botão) ela continua de
 * onde parou, do mês mais recente para o mais antigo.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { integracaoCardapioWeb, itensPedidoCardapioWeb, pedidosCardapioWeb } from "@/db/schema";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { hojeISO, intervaloDoMes, mesAtual, ultimosMeses } from "@/lib/periodo";
import {
  buscarCategoriasDoCatalogo,
  buscarHistorico,
  buscarLoja,
  buscarPedido,
  CardapioWebErro,
  configuracao,
  type ConfigCardapioWeb,
  type CwItemPedido,
  type CwPedido,
} from "./client";

/** Pedidos detalhados por rodada: cabe no tempo de uma função serverless. */
const LIMITE_DETALHES = 150;
/** Requisições de detalhe em paralelo. */
const PARALELO = 6;
/** Quantos meses de histórico buscar, no máximo — a DRE olha 12. */
const MESES_DE_HISTORICO = 13;

export type ResultadoSyncPedidos =
  | {
      ok: true;
      loja: string | null;
      /** Pedidos cujo detalhe foi gravado nesta rodada. */
      gravados: number;
      /** Pedidos que ainda faltam detalhar (próxima rodada). */
      pendentes: number;
      cobertoDesde: string | null;
    }
  | { ok: false; erro: string; status?: number };

const FUSO = "America/Maceio";
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia (YYYY-MM-DD) de um instante ISO, no fuso de Maceió. */
export function diaDe(iso: string): string {
  return DIA.format(new Date(iso));
}

/** Itens com os sub-itens (combos) achatados; só o que foi de fato vendido. */
function achatar(itens: CwItemPedido[]): CwItemPedido[] {
  const saida: CwItemPedido[] = [];
  for (const item of itens) {
    if (item.status && item.status !== "ok") continue;
    saida.push(item);
    if (item.items?.length) saida.push(...achatar(item.items));
  }
  return saida;
}

function somaDescontos(pedido: CwPedido): number {
  return (pedido.discounts ?? []).reduce((acc, d) => acc + reaisParaCentavos(d.value ?? d.amount ?? d.total ?? 0), 0);
}

/** O meio de pagamento principal: o pago de maior valor, senão o primeiro. */
function meioPagamento(pedido: CwPedido): string | null {
  const pagamentos = pedido.payments ?? [];
  const pagos = pagamentos.filter((p) => !p.status || p.status === "paid");
  const escolhido = [...(pagos.length > 0 ? pagos : pagamentos)].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
  return escolhido?.payment_method ?? null;
}

/** Guarda o estado da integração (uma linha só). */
async function gravarEstado(dados: Partial<typeof integracaoCardapioWeb.$inferInsert>) {
  await db
    .insert(integracaoCardapioWeb)
    .values({ id: "loja", ...dados, updatedAt: new Date() })
    .onConflictDoUpdate({ target: integracaoCardapioWeb.id, set: { ...dados, updatedAt: new Date() } });
}

async function gravarPedido(pedido: CwPedido, categoriaPorItem: Map<number, string>) {
  const itens = achatar(pedido.items ?? []);
  const itensCentavos = itens.reduce((acc, i) => acc + reaisParaCentavos(i.total_price ?? 0), 0);
  const agora = new Date();

  const [linha] = await db
    .insert(pedidosCardapioWeb)
    .values({
      pedidoId: pedido.id,
      displayId: pedido.display_id ?? null,
      status: pedido.status,
      tipo: pedido.order_type ?? null,
      canal: pedido.sales_channel ?? null,
      origemCliente: pedido.customer_origin ?? null,
      criadoEm: new Date(pedido.created_at),
      data: diaDe(pedido.created_at),
      agendadoPara: pedido.schedule?.scheduled_date_time_start ? diaDe(pedido.schedule.scheduled_date_time_start) : null,
      atualizadoEm: pedido.updated_at ? new Date(pedido.updated_at) : null,
      meioPagamento: meioPagamento(pedido),
      totalCentavos: reaisParaCentavos(pedido.total ?? 0),
      itensCentavos,
      taxaEntregaCentavos: reaisParaCentavos(pedido.delivery_fee ?? 0),
      descontoCentavos: somaDescontos(pedido),
      clienteNome: pedido.customer?.name ?? null,
      payloadBruto: pedido,
      updatedAt: agora,
    })
    .onConflictDoUpdate({
      target: pedidosCardapioWeb.pedidoId,
      set: {
        displayId: sql`excluded.display_id`,
        status: sql`excluded.status`,
        tipo: sql`excluded.tipo`,
        canal: sql`excluded.canal`,
        origemCliente: sql`excluded.origem_cliente`,
        criadoEm: sql`excluded.criado_em`,
        data: sql`excluded.data`,
        agendadoPara: sql`excluded.agendado_para`,
        atualizadoEm: sql`excluded.atualizado_em`,
        meioPagamento: sql`excluded.meio_pagamento`,
        totalCentavos: sql`excluded.total_centavos`,
        itensCentavos: sql`excluded.itens_centavos`,
        taxaEntregaCentavos: sql`excluded.taxa_entrega_centavos`,
        descontoCentavos: sql`excluded.desconto_centavos`,
        clienteNome: sql`excluded.cliente_nome`,
        payloadBruto: sql`excluded.payload_bruto`,
        updatedAt: agora,
      },
    })
    .returning({ id: pedidosCardapioWeb.id });

  // Itens: o conjunto atual substitui o anterior (um item removido do pedido some).
  await db.delete(itensPedidoCardapioWeb).where(eq(itensPedidoCardapioWeb.pedidoId, linha.id));
  if (itens.length > 0) {
    // order_item_id repetido no mesmo pedido (sub-item igual) derrubaria o INSERT.
    const unicos = new Map(itens.map((i) => [i.order_item_id, i]));
    await db.insert(itensPedidoCardapioWeb).values(
      [...unicos.values()].map((i) => ({
        pedidoId: linha.id,
        itemPedidoId: i.order_item_id,
        itemId: i.item_id ?? null,
        codigoExterno: i.external_code ?? null,
        nome: i.name,
        categoriaCw: i.item_id !== null && i.item_id !== undefined ? (categoriaPorItem.get(i.item_id) ?? null) : null,
        quantidade: i.quantity ?? 1,
        precoUnitarioCentavos: reaisParaCentavos(i.unit_price ?? 0),
        totalCentavos: reaisParaCentavos(i.total_price ?? 0),
      }))
    );
  }
}

/** Toda categoria do cardápio vista nos itens ganha uma linha de mapeamento (sem destino, até alguém escolher). */
async function garantirMapeamentos() {
  await db.execute(sql`
    insert into "mapeamento_cardapio_web" ("categoria_cw")
    select distinct "categoria_cw" from "itens_pedido_cardapio_web"
    where "categoria_cw" is not null
    on conflict ("categoria_cw") do nothing
  `);
}

/**
 * Itens de pedidos antigos cujo item do catálogo só agora tem categoria
 * conhecida (ou mudou de categoria): a categoria do item segue o catálogo.
 */
async function atualizarCategoriasDosItens(categoriaPorItem: Map<number, string>) {
  const porCategoria = new Map<string, number[]>();
  for (const [itemId, categoria] of categoriaPorItem) porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), itemId]);
  for (const [categoria, ids] of porCategoria) {
    for (let i = 0; i < ids.length; i += 500) {
      await db
        .update(itensPedidoCardapioWeb)
        .set({ categoriaCw: categoria })
        .where(and(inArray(itensPedidoCardapioWeb.itemId, ids.slice(i, i + 500)), sql`${itensPedidoCardapioWeb.categoriaCw} is distinct from ${categoria}`));
    }
  }
}

/**
 * Os pedidos do histórico que ainda não estão gravados, ou cujo `updated_at`
 * mudou (um pedido fechado pode ser cancelado depois).
 */
async function pedidosParaDetalhar(resumos: { id: number; updated_at?: string | null }[]): Promise<number[]> {
  if (resumos.length === 0) return [];
  const ids = resumos.map((r) => r.id);
  const gravados = new Map<number, Date | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const linhas = await db
      .select({ pedidoId: pedidosCardapioWeb.pedidoId, atualizadoEm: pedidosCardapioWeb.atualizadoEm })
      .from(pedidosCardapioWeb)
      .where(inArray(pedidosCardapioWeb.pedidoId, ids.slice(i, i + 500)));
    for (const l of linhas) gravados.set(l.pedidoId, l.atualizadoEm);
  }
  return resumos
    .filter((r) => {
      if (!gravados.has(r.id)) return true;
      const nosso = gravados.get(r.id);
      return Boolean(r.updated_at) && (!nosso || new Date(r.updated_at!).getTime() !== nosso.getTime());
    })
    .map((r) => r.id);
}

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (i < itens.length) await fn(itens[i++]);
    })
  );
}

/**
 * Uma rodada de sync. Percorre os meses do mais novo para o mais antigo (até
 * `MESES_DE_HISTORICO`), lista o histórico de cada um e detalha os pedidos
 * que faltam, até o limite da rodada. `cobertoDesde` avança para trás
 * conforme os meses ficam completos.
 */
export async function sincronizarPedidos(): Promise<ResultadoSyncPedidos> {
  const agora = new Date();
  let cfg: ConfigCardapioWeb;
  try {
    cfg = configuracao();
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }

  try {
    const loja = await buscarLoja(cfg).catch(() => null);
    const categoriaPorItem = await buscarCategoriasDoCatalogo(cfg).catch(() => new Map<number, string>());

    const hoje = hojeISO(agora);
    const meses = ultimosMeses(MESES_DE_HISTORICO, mesAtual(agora)).reverse();
    let gravados = 0;
    let pendentes = 0;
    let cobertoDesde: string | null = null;
    let incompleto = false;

    for (const mes of meses) {
      const { inicio, fim } = intervaloDoMes(mes);
      // O histórico é inclusivo no fim: o último dia do mês, nunca depois de hoje.
      const fimInclusivo = fim <= hoje ? diaAnterior(fim) : hoje;
      const resumos = await buscarHistorico(cfg, inicio, fimInclusivo);
      const faltam = await pedidosParaDetalhar(resumos);

      const cabem = Math.max(0, LIMITE_DETALHES - gravados);
      const agoraSim = faltam.slice(0, cabem);
      pendentes += faltam.length - agoraSim.length;
      await emParalelo(agoraSim, PARALELO, async (id) => {
        const pedido = await buscarPedido(cfg, id);
        await gravarPedido(pedido, categoriaPorItem);
      });
      gravados += agoraSim.length;

      if (faltam.length > agoraSim.length) {
        incompleto = true;
        break;
      }
      cobertoDesde = inicio;
    }

    await atualizarCategoriasDosItens(categoriaPorItem);
    await garantirMapeamentos();

    // Só avança a cobertura para trás; uma rodada curta não a encurta.
    const [estado] = await db.select({ cobertoDesde: integracaoCardapioWeb.cobertoDesde }).from(integracaoCardapioWeb).limit(1);
    const cobertura = incompleto
      ? (estado?.cobertoDesde ?? null)
      : cobertoDesde && (!estado?.cobertoDesde || cobertoDesde < estado.cobertoDesde)
        ? cobertoDesde
        : (estado?.cobertoDesde ?? cobertoDesde);
    const detalhe = `${gravados} pedido(s) gravado(s)` + (pendentes > 0 ? `; faltam ${pendentes} — sincronize de novo` : "");
    await gravarEstado({
      merchantUuid: cfg.merchantUuid,
      lojaNome: loja?.name ?? null,
      cobertoDesde: cobertura,
      ultimoSyncEm: agora,
      ultimoSyncOk: true,
      ultimoSyncDetalhe: detalhe,
    });
    return { ok: true, loja: loja?.name ?? null, gravados, pendentes, cobertoDesde: cobertura };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await gravarEstado({ merchantUuid: cfg.merchantUuid, ultimoSyncEm: agora, ultimoSyncOk: false, ultimoSyncDetalhe: erro }).catch(() => {});
    return { ok: false, erro, status: err instanceof CardapioWebErro ? err.status : undefined };
  }
}

/** YYYY-MM-DD do dia anterior, sem passar pelo fuso local. */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
