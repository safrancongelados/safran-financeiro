/**
 * Cliente HTTP da Pluggy, na aplicação da própria Safran.
 *
 * Os bancos são conectados pelo widget do Pluggy Connect (que pede um token
 * gerado aqui) ou, como alternativa, pelo Meu Pluggy; daqui em diante é tudo
 * leitura.
 *
 * Só roda no servidor: usa PLUGGY_CLIENT_SECRET.
 *
 * Formatos conferidos contra os tipos do pluggy-sdk oficial. Campos que nem
 * todo banco manda estão opcionais de propósito.
 */

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

export interface PluggyItem {
  id: string;
  /** UPDATED, UPDATING, OUTDATED, LOGIN_ERROR, WAITING_USER_INPUT... */
  status: string;
  executionStatus?: string | null;
  lastUpdatedAt?: string | null;
  connector?: { id: number; name: string } | null;
  error?: { code?: string; message?: string } | null;
}

export interface PluggyAccount {
  id: string;
  /** BANK ou CREDIT. */
  type: string;
  /** CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD... */
  subtype?: string | null;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  /** Em reais. Conta: saldo. Cartão: fatura em aberto. */
  balance: number;
}

interface PluggyPessoa {
  name?: string | null;
  documentNumber?: { type?: string | null; value?: string | null } | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  /** Em reais. O sinal varia entre conectores — ver `planejarMovimentacoes`. */
  amount: number;
  date: string;
  /** POSTED ou PENDING. */
  status?: string | null;
  type?: "DEBIT" | "CREDIT" | null;
  category?: string | null;
  paymentData?: {
    payer?: PluggyPessoa | null;
    receiver?: PluggyPessoa | null;
    paymentMethod?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null; cnpj?: string | null } | null;
}

interface ListaResposta<T> {
  results: T[];
}

/**
 * /v2/transactions pagina por cursor: `next` é uma query string pronta (com
 * accountId e after). Ausente ou vazio na última página.
 */
interface CursorResposta<T> {
  results: T[];
  next?: string | null;
}

/** Erro da API com o status HTTP, para quem chama distinguir 404 de falha. */
export class PluggyErro extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

let apiKeyEmCache: { chave: string; expiraEm: number } | null = null;

async function obterApiKey(): Promise<string> {
  if (apiKeyEmCache && apiKeyEmCache.expiraEm > Date.now()) return apiKeyEmCache.chave;

  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET não configurados.");
  }

  const res = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PluggyErro(`Falha ao autenticar na Pluggy (${res.status}): ${await res.text()}`, res.status);
  }

  const { apiKey } = (await res.json()) as { apiKey: string };
  // A apiKey vale 2h; renova com 5 min de folga.
  apiKeyEmCache = { chave: apiKey, expiraEm: Date.now() + 115 * 60 * 1000 };
  return apiKey;
}

async function pluggyRequest<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  const res = await fetch(`${PLUGGY_BASE_URL}${caminho}`, {
    method: metodo,
    headers: {
      "X-API-KEY": await obterApiKey(),
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PluggyErro(`Pluggy ${metodo} ${caminho} falhou (${res.status}): ${await res.text()}`, res.status);
  }
  return res.json() as Promise<T>;
}

function pluggyGet<T>(caminho: string): Promise<T> {
  return pluggyRequest<T>("GET", caminho);
}

/**
 * Token de curta duração que o navegador usa para abrir o Pluggy Connect.
 * Com `itemId`, o widget abre em modo de atualização daquela conexão
 * (renovar consentimento); sem, abre para conectar um banco novo.
 *
 * O corpo é `{ itemId, options }` — é o que o pluggy-sdk envia. O exemplo do
 * painel da Pluggy, que passa as opções como primeiro argumento, não bate com
 * a assinatura real.
 */
export async function criarConnectToken(opcoes: { itemId?: string; webhookUrl?: string } = {}): Promise<string> {
  const { accessToken } = await pluggyRequest<{ accessToken: string }>("POST", "/connect_token", {
    itemId: opcoes.itemId,
    options: {
      clientUserId: "safran",
      // Mesmo banco conectado duas vezes viraria extrato em dobro.
      avoidDuplicates: true,
      webhookUrl: opcoes.webhookUrl,
    },
  });
  return accessToken;
}

export async function buscarItem(itemId: string): Promise<PluggyItem> {
  return pluggyGet<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
}

export async function buscarContas(itemId: string): Promise<PluggyAccount[]> {
  const data = await pluggyGet<ListaResposta<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return data.results;
}

/**
 * Todas as transações de uma conta. Usa /v2/transactions: o /transactions sem
 * versão responde 410 (ENDPOINT_DEPRECATED).
 */
export async function buscarTransacoes(accountId: string): Promise<PluggyTransaction[]> {
  const todas: PluggyTransaction[] = [];
  let caminho: string | null = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  while (caminho) {
    const pagina: CursorResposta<PluggyTransaction> = await pluggyGet<CursorResposta<PluggyTransaction>>(caminho);
    todas.push(...pagina.results);
    caminho = pagina.next ? `/v2/transactions${pagina.next}` : null;
  }
  return todas;
}
