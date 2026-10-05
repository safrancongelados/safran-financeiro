/**
 * Transforma transações da Pluggy em linhas do extrato. Sem I/O: é aqui que
 * mora a regra de sinal, que é onde um erro inverte entrada e saída.
 */
import type { PluggyTransaction } from "./client";

/** CNPJ da própria Safran, só dígitos. */
export const CNPJ_SAFRAN = "31511591000195";

/**
 * Dinheiro que só trocou de conta dentro da Safran (ex.: Mercado Pago para o
 * banco). Entra e sai do extrato, mas não é receita nem despesa — somar
 * contaria o mesmo real duas vezes.
 */
export function eTransferenciaInterna(contraparteDocumento: string | null): boolean {
  return contraparteDocumento === CNPJ_SAFRAN;
}

export interface MovimentacaoPlanejada {
  providerTransactionId: string;
  data: string; // YYYY-MM-DD
  descricao: string;
  /** Positivo entrou no caixa, negativo saiu. */
  valorCentavos: number;
  tipo: "DEBIT" | "CREDIT" | null;
  meio: string | null;
  contraparte: string | null;
  contraparteDocumento: string | null;
  categoriaPluggy: string | null;
}

function limpar(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? t : null;
}

/**
 * Sinal do ponto de vista do caixa da Safran.
 *
 * `type` vence quando vem (DEBIT sai, CREDIT entra), porque o sinal de
 * `amount` muda de conector para conector. Sem `type`, conta corrente confia
 * no sinal de `amount`; cartão inverte, porque lá valor positivo é compra.
 */
export function valorNoCaixa(tx: Pick<PluggyTransaction, "amount" | "type">, tipoConta: string): number {
  const absoluto = Math.round(Math.abs(tx.amount) * 100);
  if (tx.type === "DEBIT") return -absoluto;
  if (tx.type === "CREDIT") return absoluto;
  const centavos = Math.round(tx.amount * 100);
  return tipoConta === "CREDIT" ? -centavos : centavos;
}

/**
 * Transações pendentes ficam de fora: o banco ainda pode cancelar ou trocar o
 * identificador quando a transação é efetivada, e aí o extrato ficaria com
 * uma linha fantasma. Elas entram no sync seguinte, já efetivadas.
 */
export function planejarMovimentacoes(transacoes: PluggyTransaction[], tipoConta: string): MovimentacaoPlanejada[] {
  return transacoes
    .filter((tx) => tx.status !== "PENDING")
    .map((tx) => {
      const valorCentavos = valorNoCaixa(tx, tipoConta);
      // Na entrada interessa quem pagou; na saída, quem recebeu.
      const pessoa = valorCentavos >= 0 ? tx.paymentData?.payer : tx.paymentData?.receiver;
      const contraparte =
        limpar(pessoa?.name) ?? limpar(tx.merchant?.businessName) ?? limpar(tx.merchant?.name);
      const documento = limpar(pessoa?.documentNumber?.value) ?? limpar(tx.merchant?.cnpj);

      return {
        providerTransactionId: tx.id,
        data: tx.date.slice(0, 10),
        descricao: limpar(tx.description) ?? "(sem descrição)",
        valorCentavos,
        tipo: tx.type ?? null,
        meio: limpar(tx.paymentData?.paymentMethod),
        contraparte,
        // Tira só a pontuação: o Open Finance costuma mascarar CPF com "*", e
        // apagar a máscara deixaria um número parcial com cara de completo.
        contraparteDocumento: documento ? documento.replace(/[.\-/\s]/g, "") || null : null,
        categoriaPluggy: limpar(tx.category),
      };
    });
}
