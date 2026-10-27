/**
 * Filtros do extrato: o que vai na URL, como se lê e como se escreve. Sem
 * I/O, compartilhado entre a página (servidor), a barra de filtros (cliente)
 * e a exportação.
 *
 * O período é um mês (`mes`), um atalho relativo a hoje (`periodo`: 3m, 6m,
 * 12m, ano) ou um intervalo de datas (`de` e `ate`, inclusive). Os três se
 * excluem: o atalho vence o mês, e as datas vencem os dois.
 */
import { deslocarMes, intervaloDoMes, rotuloMes, ultimosMeses } from "./periodo";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type TipoMovimento = "entrada" | "saida";
export type OrdemExtrato = "data" | "valor" | "nome";
export type Direcao = "asc" | "desc";
export type VisaoExtrato = "lancamentos" | "nomes";
export type PeriodoRapido = "3m" | "6m" | "12m" | "ano";
export type OrigemFiltro = "regra" | "manual" | "pessoa" | "estorno";

export interface FiltroExtrato {
  mes: string;
  /** Atalho relativo a hoje. Com ele, `mes` é ignorado. */
  periodo?: PeriodoRapido;
  /** Intervalo de datas, inclusive. Vence o mês e o atalho. */
  de?: string;
  ate?: string;
  /** Texto livre: nome, descrição, contraparte ou CPF/CNPJ. */
  q?: string;
  tipo?: TipoMovimento;
  /** Id de categoria, ou "sem" para as linhas sem categoria. */
  categoria?: string;
  /** Id de centro de custo, ou "sem" para as linhas sem centro. */
  centro?: string;
  conta?: string;
  /** Id de pessoa, ou "sem" para as linhas sem pessoa reconhecida. */
  pessoa?: string;
  /** Faixa de valor absoluto, em centavos. */
  min?: number;
  max?: number;
  origem?: OrigemFiltro;
  ordem?: OrdemExtrato;
  dir?: Direcao;
  visao?: VisaoExtrato;
}

const ORDENS: OrdemExtrato[] = ["data", "valor", "nome"];
const PERIODOS: PeriodoRapido[] = ["3m", "6m", "12m", "ano"];
const ORIGENS: OrigemFiltro[] = ["regra", "manual", "pessoa", "estorno"];

export const PERIODO_LABEL: Record<PeriodoRapido, string> = {
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
  ano: "Este ano",
};

export const ORIGEM_LABEL: Record<OrigemFiltro, string> = {
  regra: "por regra",
  manual: "só nesta (manual)",
  pessoa: "pela pessoa",
  estorno: "estorno pareado",
};

/** A direção que cada ordenação tem quando não se pede outra. */
export const DIRECAO_PADRAO: Record<OrdemExtrato, Direcao> = { data: "desc", valor: "desc", nome: "asc" };

type Params = Record<string, string | string[] | undefined>;

const texto = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const idOuSem = (v: unknown): string | undefined =>
  typeof v === "string" && (v === "sem" || UUID.test(v)) ? v : undefined;
const data = (v: unknown): string | undefined => (typeof v === "string" && DATA.test(v) ? v : undefined);
/** Valor em reais na URL ("150" ou "150,50"); em centavos aqui. */
const centavos = (v: unknown): number | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

/** Lê os filtros da URL, ignorando o que não é válido. `sem=1` (links antigos) vira `categoria=sem`. */
export function lerFiltroExtrato(params: Params, mesPadrao: string, mesValido: (m: string) => boolean): FiltroExtrato {
  const mes = typeof params.mes === "string" && mesValido(params.mes) ? params.mes : mesPadrao;
  const ordem = ORDENS.includes(params.ordem as OrdemExtrato) ? (params.ordem as OrdemExtrato) : undefined;
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : undefined;
  const tipo = params.tipo === "entrada" || params.tipo === "saida" ? params.tipo : undefined;
  const de = data(params.de);
  const ate = data(params.ate);
  const min = centavos(params.min);
  const max = centavos(params.max);
  return {
    mes,
    periodo: PERIODOS.includes(params.periodo as PeriodoRapido) ? (params.periodo as PeriodoRapido) : undefined,
    // Intervalo só vale com as duas pontas em ordem.
    de: de && ate && de <= ate ? de : undefined,
    ate: de && ate && de <= ate ? ate : undefined,
    q: texto(params.q)?.slice(0, 80),
    tipo,
    categoria: params.sem === "1" ? "sem" : idOuSem(params.categoria),
    centro: idOuSem(params.centro),
    conta: typeof params.conta === "string" && UUID.test(params.conta) ? params.conta : undefined,
    pessoa: idOuSem(params.pessoa),
    min,
    max: max !== undefined && (min === undefined || max >= min) ? max : undefined,
    origem: ORIGENS.includes(params.origem as OrigemFiltro) ? (params.origem as OrigemFiltro) : undefined,
    ordem,
    dir: ordem && dir && dir !== DIRECAO_PADRAO[ordem] ? dir : undefined,
    visao: params.visao === "nomes" ? "nomes" : undefined,
  };
}

/** Os parâmetros da URL com estes filtros; o que está no padrão fica de fora. */
export function paramsExtrato(filtro: FiltroExtrato): URLSearchParams {
  const params = new URLSearchParams();
  if (filtro.de && filtro.ate) {
    params.set("de", filtro.de);
    params.set("ate", filtro.ate);
  } else if (filtro.periodo) {
    params.set("periodo", filtro.periodo);
  } else {
    params.set("mes", filtro.mes);
  }
  if (filtro.q) params.set("q", filtro.q);
  if (filtro.tipo) params.set("tipo", filtro.tipo);
  if (filtro.categoria) params.set("categoria", filtro.categoria);
  if (filtro.centro) params.set("centro", filtro.centro);
  if (filtro.conta) params.set("conta", filtro.conta);
  if (filtro.pessoa) params.set("pessoa", filtro.pessoa);
  if (filtro.min !== undefined) params.set("min", reaisNaUrl(filtro.min));
  if (filtro.max !== undefined) params.set("max", reaisNaUrl(filtro.max));
  if (filtro.origem) params.set("origem", filtro.origem);
  if (filtro.ordem) params.set("ordem", filtro.ordem);
  if (filtro.ordem && filtro.dir && filtro.dir !== DIRECAO_PADRAO[filtro.ordem]) params.set("dir", filtro.dir);
  if (filtro.visao === "nomes") params.set("visao", "nomes");
  return params;
}

function reaisNaUrl(centavos: number): string {
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2).replace(".", ",");
}

export function hrefExtrato(filtro: FiltroExtrato): string {
  return `/extrato?${paramsExtrato(filtro)}`;
}

/** Há algum filtro além do período (e da visão)? */
export function temFiltro(filtro: FiltroExtrato): boolean {
  return Boolean(
    filtro.q ||
      filtro.tipo ||
      filtro.categoria ||
      filtro.centro ||
      filtro.conta ||
      filtro.pessoa ||
      filtro.min !== undefined ||
      filtro.max !== undefined ||
      filtro.origem
  );
}

/** Só o período e a visão: o que "Limpar filtros" deixa. */
export function semFiltros(filtro: FiltroExtrato): FiltroExtrato {
  return { mes: filtro.mes, periodo: filtro.periodo, de: filtro.de, ate: filtro.ate, visao: filtro.visao };
}

/** A ordenação em vigor (a pedida ou a padrão). */
export function ordemEmVigor(filtro: FiltroExtrato): { ordem: OrdemExtrato; dir: Direcao } {
  const ordem = filtro.ordem ?? "data";
  return { ordem, dir: filtro.dir ?? DIRECAO_PADRAO[ordem] };
}

/** Clicar no cabeçalho: ordena por ele; clicar de novo, inverte. */
export function alternarOrdem(filtro: FiltroExtrato, ordem: OrdemExtrato): FiltroExtrato {
  const vigente = ordemEmVigor(filtro);
  const dir: Direcao = vigente.ordem === ordem ? (vigente.dir === "asc" ? "desc" : "asc") : DIRECAO_PADRAO[ordem];
  return { ...filtro, ordem, dir };
}

// ── Período ────────────────────────────────────────────────────────────────

/** Intervalo [inicio, fim) em datas YYYY-MM-DD que o filtro cobre. `hoje` em YYYY-MM-DD. */
export function intervaloDoFiltro(filtro: FiltroExtrato, hoje: string): { inicio: string; fim: string } {
  if (filtro.de && filtro.ate) return { inicio: filtro.de, fim: diaSeguinte(filtro.ate) };
  const mesCorrente = hoje.slice(0, 7);
  if (filtro.periodo === "ano") return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: `${deslocarMes(mesCorrente, 1)}-01` };
  if (filtro.periodo) {
    const meses = ultimosMeses(Number(filtro.periodo.replace("m", "")), mesCorrente);
    return { inicio: `${meses[0]}-01`, fim: `${deslocarMes(mesCorrente, 1)}-01` };
  }
  return intervaloDoMes(filtro.mes);
}

function diaSeguinte(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "21/10/2026" */
function rotuloData(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** "Outubro de 2026", "Últimos 6 meses", "01/05/2026 a 31/10/2026". */
export function rotuloDoPeriodo(filtro: FiltroExtrato, hoje: string): string {
  if (filtro.de && filtro.ate) return `${rotuloData(filtro.de)} a ${rotuloData(filtro.ate)}`;
  if (filtro.periodo === "ano") return `${hoje.slice(0, 4)} até hoje`;
  if (filtro.periodo) return `Últimos ${PERIODO_LABEL[filtro.periodo].toLowerCase()}`;
  return rotuloMes(filtro.mes);
}

/** O filtro só cobre um mês? (O passo de mês na barra só faz sentido assim.) */
export function ePorMes(filtro: FiltroExtrato): boolean {
  return !filtro.periodo && !(filtro.de && filtro.ate);
}
