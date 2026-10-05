/** Datas da DRE e do extrato: sempre no fuso de Maceió, meses no formato YYYY-MM. */

const FUSO = "America/Maceio";

export function mesAtual(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(agora);
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
