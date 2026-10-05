/** Regras de exibição do extrato bancário — sem I/O. */

/** CPF/CNPJ formatado; máscara do banco (com "*") passa como veio. */
export function formatarDocumento(doc: string | null): string | null {
  if (!doc) return null;
  if (/^\d{11}$/.test(doc)) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^\d{14}$/.test(doc)) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

type Tom = "success" | "warning" | "destructive" | "sky" | "secondary";

/**
 * Status do item na Pluggy. É o estado da conexão com o banco, não do nosso
 * sync: um sync pode dar certo e ainda assim trazer dado velho, se o
 * consentimento expirou.
 */
export function statusConexao(status: string | null): {
  label: string;
  tom: Tom;
  acao?: string;
  reconectar?: boolean;
} {
  switch (status) {
    case "UPDATED":
      return { label: "Conectado", tom: "success" };
    case "UPDATING":
    case "MERGING":
      return { label: "Atualizando", tom: "sky" };
    case "OUTDATED":
      return {
        label: "Desatualizado",
        tom: "warning",
        acao: "O banco não respondeu na última atualização. Se persistir, reconecte.",
        reconectar: true,
      };
    case "LOGIN_ERROR":
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION":
      return {
        label: "Reconectar",
        tom: "destructive",
        acao: "O consentimento expirou ou foi revogado. Reconecte para o extrato voltar a atualizar.",
        reconectar: true,
      };
    case "DELETED":
      return {
        label: "Removida",
        tom: "secondary",
        acao: "Conexão apagada na Pluggy. O histórico continua aqui; para voltar a atualizar, conecte de novo.",
      };
    default:
      return { label: status ?? "Sem status", tom: "secondary" };
  }
}

export const TIPO_CONTA_LABEL: Record<string, string> = {
  CHECKING_ACCOUNT: "Conta corrente",
  SAVINGS_ACCOUNT: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
};
