/** Datas da DRE e do extrato: sempre no fuso de Maceió, meses no formato YYYY-MM. */

const FUSO = "America/Maceio";

export function mesAtual(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(agora);
}

/** Hoje, em YYYY-MM-DD, no fuso de Maceió. */
export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    agora
  );
}

export function mesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

export function anoValido(ano: string): boolean {
  return /^20\d{2}$/.test(ano);
}

export function deslocarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Intervalo [inicio, fim) em datas YYYY-MM-DD, para filtrar a coluna `data`. */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } {
  return { inicio: `${mes}-01`, fim: `${deslocarMes(mes, 1)}-01` };
}

export function mesesDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

/** Os `n` meses que terminam em `ate` (inclusive), do mais antigo ao mais novo. */
export function ultimosMeses(n: number, ate: string): string[] {
  return Array.from({ length: n }, (_, i) => deslocarMes(ate, i - (n - 1)));
}

/** Quantos dias tem o mês. */
export function diasDoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** O mesmo dia (ou o último, se o mês for mais curto) de outro mês, em YYYY-MM-DD. */
export function mesmoDiaEm(mes: string, dia: number): string {
  return `${mes}-${String(Math.min(dia, diasDoMes(mes))).padStart(2, "0")}`;
}

function nomeDoMes(mes: string, formato: "long" | "short"): string {
  const [ano, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: formato, timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, m - 1, 1)))
    .replace(".", "");
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
}

/** "Outubro de 2026" */
export function rotuloMes(mes: string): string {
  return `${nomeDoMes(mes, "long")} de ${mes.slice(0, 4)}`;
}

/** "Out" — cabeçalho de coluna da DRE. */
export function rotuloMesCurto(mes: string): string {
  return nomeDoMes(mes, "short");
}

/** "Out/26" — quando o ano importa (seletor de mês, últimos 12 meses). */
export function rotuloMesAno(mes: string): string {
  return `${nomeDoMes(mes, "short")}/${mes.slice(2, 4)}`;
}

/** "21/10" a partir de YYYY-MM-DD, sem passar por Date (que mudaria o dia pelo fuso). */
export function rotuloDia(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

// ── Período da DRE e do fluxo de caixa ─────────────────────────────────────

/** Ano civil ou os últimos 12 meses (o Open Finance traz cerca de um ano de histórico). */
export type Periodo = { tipo: "ano"; ano: number } | { tipo: "12m" };

/** Lê `?periodo=12m` ou `?ano=YYYY`; sem nada (ou inválido), o ano corrente. */
export function lerPeriodo(params: { periodo?: unknown; ano?: unknown }, hoje: string): Periodo {
  const anoCorrente = Number(hoje.slice(0, 4));
  if (params.periodo === "12m") return { tipo: "12m" };
  if (typeof params.ano === "string" && anoValido(params.ano) && Number(params.ano) <= anoCorrente) {
    return { tipo: "ano", ano: Number(params.ano) };
  }
  return { tipo: "ano", ano: anoCorrente };
}

/** Os meses do período, até o mês corrente — mês que ainda não chegou não tem coluna. */
export function mesesDoPeriodo(periodo: Periodo, hoje: string): string[] {
  if (periodo.tipo === "12m") return ultimosMeses(12, hoje);
  return mesesDoAno(periodo.ano).filter((m) => m <= hoje);
}

/** Intervalo [inicio, fim) em datas, cobrindo todos os meses do período. */
export function intervaloDoPeriodo(periodo: Periodo, hoje: string): { inicio: string; fim: string } {
  const meses = mesesDoPeriodo(periodo, hoje);
  return { inicio: `${meses[0]}-01`, fim: `${deslocarMes(meses[meses.length - 1], 1)}-01` };
}

export function rotuloPeriodo(periodo: Periodo): string {
  return periodo.tipo === "12m" ? "Últimos 12 meses" : String(periodo.ano);
}

export function paramsDoPeriodo(periodo: Periodo): Record<string, string> {
  return periodo.tipo === "12m" ? { periodo: "12m" } : { ano: String(periodo.ano) };
}
