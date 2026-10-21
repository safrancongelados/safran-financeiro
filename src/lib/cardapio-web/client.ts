/**
 * Cliente HTTP da API do Cardápio Web (a loja virtual da Safran).
 *
 * Só leitura, só no servidor: usa CARDAPIO_WEB_TOKEN. Os formatos seguem o
 * que a API devolve para pedidos (histórico, detalhe) e catálogo; campos que
 * nem todo pedido traz estão opcionais de propósito.
 *
 * As rotas ficam todas em `ROTAS`, num lugar só: a documentação pública
 * (docs.cardapioweb.com → Referência da API) é quem manda, e qualquer ajuste
 * de caminho ou parâmetro se faz aqui, sem mexer no sync.
 */

export class CardapioWebErro extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url?: string
  ) {
    super(message);
  }
}

export interface ConfigCardapioWeb {
  baseUrl: string;
  token: string;
  merchantUuid: string;
  /** Header que leva o token. `Authorization` manda `Bearer <token>`; outro header manda o token puro. */
  headerToken: string;
}

/** Lê e valida a configuração do ambiente; erro claro quando falta algo. */
export function configuracao(): ConfigCardapioWeb {
  const baseUrl = process.env.CARDAPIO_WEB_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.CARDAPIO_WEB_TOKEN?.trim();
  const merchantUuid = process.env.CARDAPIO_WEB_MERCHANT_UUID?.trim();
  const faltam = [
    !baseUrl && "CARDAPIO_WEB_API_URL",
    !token && "CARDAPIO_WEB_TOKEN",
    !merchantUuid && "CARDAPIO_WEB_MERCHANT_UUID",
  ].filter(Boolean);
  if (faltam.length > 0 || !baseUrl || !token || !merchantUuid) {
    throw new CardapioWebErro(`Cardápio Web não configurado: falta ${faltam.join(", ")}.`, 0);
  }
  return { baseUrl, token, merchantUuid, headerToken: process.env.CARDAPIO_WEB_TOKEN_HEADER?.trim() || "Authorization" };
}

/** Está configurado? (para a tela decidir o que mostrar sem lançar erro) */
export function estaConfigurado(): boolean {
  try {
    configuracao();
    return true;
  } catch {
    return false;
  }
}

/** Os caminhos da API, relativos à base, com a loja já no lugar. */
const ROTAS = {
  loja: (m: string) => `/merchants/${m}`,
  historico: (m: string) => `/merchants/${m}/orders/history`,
  pedido: (m: string, id: number) => `/merchants/${m}/orders/${id}`,
  catalogo: (m: string) => `/merchants/${m}/catalog`,
};

export interface CwLoja {
  id?: number;
  uuid?: string;
  name: string;
  slug?: string;
}

/** Linha do histórico: só o essencial; os itens vêm no detalhe. */
export interface CwPedidoResumo {
  id: number;
  status: string;
  order_type?: string | null;
  order_timing?: string | null;
  sales_channel?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface CwItemPedido {
  item_id?: number | null;
  order_item_id: number;
  external_code?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  kind?: string | null;
  status?: string | null;
  options?: unknown[];
  items?: CwItemPedido[];
}

export interface CwPagamento {
  total: number;
  payment_type?: string | null;
  status?: string | null;
  payment_method?: string | null;
  payment_fee?: number | null;
}

export interface CwPedido extends CwPedidoResumo {
  display_id?: number | null;
  customer_origin?: string | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  additional_fee?: number | null;
  total: number;
  schedule?: { scheduled_date_time_start?: string | null } | null;
  customer?: { id?: number; name?: string | null } | null;
  items: CwItemPedido[];
  discounts?: { value?: number; amount?: number; total?: number }[] | null;
  payments?: CwPagamento[] | null;
}

/** Catálogo atual: só o que liga item a categoria. */
export interface CwCategoriaCatalogo {
  id: number;
  name: string;
  items?: { id: number; name?: string; external_code?: string | null }[];
}

interface CwHistoricoResposta {
  orders?: CwPedidoResumo[];
  data?: CwPedidoResumo[];
  pagination?: { current_page?: number; total_pages?: number; total_orders?: number };
  meta?: { page?: number; total_pages?: number; total?: number };
}

async function requisitar<T>(cfg: ConfigCardapioWeb, caminho: string, params?: Record<string, string | string[]>): Promise<T> {
  const url = new URL(`${cfg.baseUrl}${caminho}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(`${k}[]`, item);
    else url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  headers[cfg.headerToken] = cfg.headerToken.toLowerCase() === "authorization" ? `Bearer ${cfg.token}` : cfg.token;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 300);
    throw new CardapioWebErro(`Cardápio Web GET ${url.pathname} falhou (${res.status}): ${corpo}`, res.status, url.toString());
  }
  return res.json() as Promise<T>;
}

export async function buscarLoja(cfg: ConfigCardapioWeb): Promise<CwLoja> {
  return requisitar<CwLoja>(cfg, ROTAS.loja(cfg.merchantUuid));
}

/**
 * Pedidos fechados e cancelados num intervalo de datas (YYYY-MM-DD, até 6
 * meses), página a página. O histórico vem sem itens; `buscarPedido` traz.
 */
export async function buscarHistorico(
  cfg: ConfigCardapioWeb,
  inicio: string,
  fim: string,
  status: ("closed" | "canceled")[] = ["closed", "canceled"]
): Promise<CwPedidoResumo[]> {
  const todos: CwPedidoResumo[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const r = await requisitar<CwHistoricoResposta>(cfg, ROTAS.historico(cfg.merchantUuid), {
      start_date: inicio,
      end_date: fim,
      page: String(pagina),
      per_page: "100",
      status,
    });
    todos.push(...(r.orders ?? r.data ?? []));
    totalPaginas = r.pagination?.total_pages ?? r.meta?.total_pages ?? 1;
    pagina++;
  } while (pagina <= totalPaginas && pagina <= 200);
  return todos;
}

export async function buscarPedido(cfg: ConfigCardapioWeb, id: number): Promise<CwPedido> {
  const r = await requisitar<CwPedido | { order: CwPedido }>(cfg, ROTAS.pedido(cfg.merchantUuid, id));
  return "order" in r && r.order ? r.order : (r as CwPedido);
}

/** Item do catálogo → nome da categoria em que ele está hoje. */
export async function buscarCategoriasDoCatalogo(cfg: ConfigCardapioWeb): Promise<Map<number, string>> {
  const r = await requisitar<
    | { categories?: CwCategoriaCatalogo[] }
    | { data?: CwCategoriaCatalogo[] }
    | { items?: { id: number; category_id?: number; category?: { id: number; name: string } | null }[]; categories?: CwCategoriaCatalogo[] }
  >(cfg, ROTAS.catalogo(cfg.merchantUuid));

  const porItem = new Map<number, string>();
  const categorias = ("categories" in r && r.categories) || ("data" in r && r.data) || [];
  for (const c of categorias) for (const item of c.items ?? []) porItem.set(item.id, c.name);
  if ("items" in r && Array.isArray(r.items)) {
    const nomePorCategoria = new Map(categorias.map((c) => [c.id, c.name]));
    for (const item of r.items) {
      const nome = item.category?.name ?? (item.category_id !== undefined ? nomePorCategoria.get(item.category_id) : undefined);
      if (nome) porItem.set(item.id, nome);
    }
  }
  return porItem;
}
