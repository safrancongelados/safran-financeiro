import type { GrupoDre } from "@/db/schema";

/**
 * Os grupos do plano de contas, na ordem da DRE. `naDre: false` são os que só
 * aparecem no fluxo de caixa: compra de equipamento, empréstimo, dinheiro de
 * sócio e transferência mexem no saldo, mas não são resultado da operação.
 */
export const GRUPOS: { id: GrupoDre; label: string; naDre: boolean; ajuda: string }[] = [
  { id: "receita", label: "Receita bruta", naDre: true, ajuda: "Vendas e outras entradas da operação." },
  { id: "deducao", label: "Deduções", naDre: true, ajuda: "Impostos sobre a venda (DAS) e estornos." },
  {
    id: "custo_variavel",
    label: "Custos variáveis",
    naDre: true,
    ajuda: "Sobem com o volume: insumos, embalagens, taxas de pagamento, entrega.",
  },
  {
    id: "despesa_fixa",
    label: "Despesas fixas",
    naDre: true,
    ajuda: "Existem com ou sem venda: aluguel, pessoal, energia, sistemas.",
  },
  { id: "financeiro", label: "Resultado financeiro", naDre: true, ajuda: "Juros pagos e rendimentos." },
  { id: "investimento", label: "Investimentos", naDre: false, ajuda: "Equipamentos e reformas." },
  {
    id: "financiamento",
    label: "Empréstimos",
    naDre: false,
    ajuda: "Dinheiro de empréstimo que entrou e parcelas pagas.",
  },
  { id: "socios", label: "Sócios", naDre: false, ajuda: "Aportes e retiradas dos sócios." },
  {
    id: "transferencia",
    label: "Transferências",
    naDre: false,
    ajuda: "Entre contas da própria Safran. Não somam em nada.",
  },
];

export const LABEL_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.id, g.label])) as Record<GrupoDre, string>;
