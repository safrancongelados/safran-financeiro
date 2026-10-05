const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** A API do banco fala em reais com casas decimais; aqui tudo vira centavo inteiro. */
export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100);
}

export function formatarCentavos(centavos: number): string {
  return BRL.format(centavos / 100);
}

/** Percentual com uma casa, ou "—" quando a base é zero. */
export function formatarPercentual(parte: number, base: number): string {
  if (base === 0) return "—";
  return `${((parte / base) * 100).toFixed(1).replace(".", ",")}%`;
}
