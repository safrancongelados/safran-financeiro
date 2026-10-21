/**
 * Filtros do extrato: o que vai na URL, como se lê e como se escreve. Sem
 * I/O, compartilhado entre a página (servidor) e a barra de filtros (cliente).
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TipoMovimento = "entrada" | "saida";
export type OrdemExtrato = "data" | "valor" | "nome";
export type Direcao = "asc" | "desc";
export type VisaoExtrato = "lancamentos" | "nomes";

export interface FiltroExtrato {
  mes: string;
  /** Texto livre: nome, descrição, contraparte ou CPF/CNPJ. */
  q?: string;
  tipo?: TipoMovimento;
  /** Id de categoria, ou "sem" para as linhas sem categoria. */
  categoria?: string;
  /** Id de centro de custo, ou "sem" para as linhas sem centro. */
  centro?: string;
  conta?: string;
  ordem?: OrdemExtrato;
  dir?: Direcao;
  visao?: VisaoExtrato;
}

const ORDENS: OrdemExtrato[] = ["data", "valor", "nome"];

/** A direção que cada ordenação tem quando não se pede outra. */
export const DIRECAO_PADRAO: Record<OrdemExtrato, Direcao> = { data: "desc", valor: "desc", nome: "asc" };

type Params = Record<string, string | string[] | undefined>;

const texto = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const idOuSem = (v: unknown): string | undefined =>
  typeof v === "string" && (v === "sem" || UUID.test(v)) ? v : undefined;

/** Lê os filtros da URL, ignorando o que não é válido. `sem=1` (links antigos) vira `categoria=sem`. */
export function lerFiltroExtrato(params: Params, mesPadrao: string, mesValido: (m: string) => boolean): FiltroExtrato {
  const mes = typeof params.mes === "string" && mesValido(params.mes) ? params.mes : mesPadrao;
  const ordem = ORDENS.includes(params.ordem as OrdemExtrato) ? (params.ordem as OrdemExtrato) : undefined;
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : undefined;
  const tipo = params.tipo === "entrada" || params.tipo === "saida" ? params.tipo : undefined;
  return {
    mes,
    q: texto(params.q)?.slice(0, 80),
    tipo,
    categoria: params.sem === "1" ? "sem" : idOuSem(params.categoria),
    centro: idOuSem(params.centro),
    conta: typeof params.conta === "string" && UUID.test(params.conta) ? params.conta : undefined,
    ordem,
    dir: ordem && dir && dir !== DIRECAO_PADRAO[ordem] ? dir : undefined,
    visao: params.visao === "nomes" ? "nomes" : undefined,
  };
}

/** A URL do extrato com estes filtros; o que está no padrão fica de fora. */
export function hrefExtrato(filtro: FiltroExtrato): string {
  const params = new URLSearchParams({ mes: filtro.mes });
  if (filtro.q) params.set("q", filtro.q);
  if (filtro.tipo) params.set("tipo", filtro.tipo);
  if (filtro.categoria) params.set("categoria", filtro.categoria);
  if (filtro.centro) params.set("centro", filtro.centro);
  if (filtro.conta) params.set("conta", filtro.conta);
  if (filtro.ordem) params.set("ordem", filtro.ordem);
  if (filtro.ordem && filtro.dir && filtro.dir !== DIRECAO_PADRAO[filtro.ordem]) params.set("dir", filtro.dir);
  if (filtro.visao === "nomes") params.set("visao", "nomes");
  return `/extrato?${params}`;
}

/** Há algum filtro além do mês (e da visão)? */
export function temFiltro(filtro: FiltroExtrato): boolean {
  return Boolean(filtro.q || filtro.tipo || filtro.categoria || filtro.centro || filtro.conta);
}

/** Só o mês e a visão: o que "Limpar filtros" deixa. */
export function semFiltros(filtro: FiltroExtrato): FiltroExtrato {
  return { mes: filtro.mes, visao: filtro.visao };
}

/**
 * Clicar no cabeçalho de uma coluna: primeira vez ordena por ela na direção
 * padrão; de novo, inverte.
 */
export function alternarOrdem(filtro: FiltroExtrato, ordem: OrdemExtrato): FiltroExtrato {
  const atual = filtro.ordem ?? "data";
  const dirAtual = filtro.dir ?? DIRECAO_PADRAO[atual];
  if (atual !== ordem) return { ...filtro, ordem: ordem === "data" ? undefined : ordem, dir: undefined };
  const invertida: Direcao = dirAtual === "asc" ? "desc" : "asc";
  return {
    ...filtro,
    ordem: ordem === "data" && invertida === DIRECAO_PADRAO.data ? undefined : ordem,
    dir: invertida === DIRECAO_PADRAO[ordem] ? undefined : invertida,
  };
}

/** A ordenação em vigor, com a direção resolvida. */
export function ordemEmVigor(filtro: FiltroExtrato): { ordem: OrdemExtrato; dir: Direcao } {
  const ordem = filtro.ordem ?? "data";
  return { ordem, dir: filtro.dir ?? DIRECAO_PADRAO[ordem] };
}
