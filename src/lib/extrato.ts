/** Regras de exibição do extrato bancário — sem I/O. */
import { regraAPartirDe, sentidoDe, type MovimentacaoParaRegra } from "./regras";

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

// ── Visão "por nome" ───────────────────────────────────────────────────────

export interface MovimentacaoAgrupavel extends MovimentacaoParaRegra {
  id: string;
  data: string;
  nomeExibicao: string | null;
  categoriaId: string | null;
}

export interface GrupoIguais<M extends MovimentacaoAgrupavel> {
  /** Uma movimentação do grupo: editar nome, categoria ou centro nela vale para todas. */
  exemplo: M;
  sentido: "entrada" | "saida";
  /** A descrição mais frequente no grupo — o "nome do banco". */
  descricao: string;
  /** O texto que, na busca, encontra as linhas deste grupo. */
  busca: string;
  quantidade: number;
  totalCentavos: number;
  /** Quantas do grupo estão sem categoria. */
  semCategoria: number;
  ultimaData: string;
}

/**
 * Agrupa as linhas "iguais" — a mesma identidade que a edição do extrato
 * usa (CPF/CNPJ, senão contraparte, senão descrição, no mesmo sentido). Uma
 * linha sem identidade fica num grupo só dela. Saídas primeiro, depois as de
 * mais lançamentos.
 */
export function agruparIguais<M extends MovimentacaoAgrupavel>(movs: M[]): GrupoIguais<M>[] {
  const grupos = new Map<string, GrupoIguais<M> & { descricoes: Map<string, number> }>();
  for (const m of movs) {
    const id = regraAPartirDe(m);
    const chave = id ? `${id.campo}|${id.padrao}|${id.sentido}` : `linha|${m.id}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        exemplo: m,
        sentido: sentidoDe(m.valorCentavos),
        descricao: m.descricao,
        busca: id ? (id.campo === "documento" ? id.padrao : (id.campo === "contraparte" ? m.contraparte : m.descricao) ?? m.descricao) : m.descricao,
        quantidade: 0,
        totalCentavos: 0,
        semCategoria: 0,
        ultimaData: m.data,
        descricoes: new Map(),
      };
      grupos.set(chave, g);
    }
    g.quantidade += 1;
    g.totalCentavos += m.valorCentavos;
    if (!m.categoriaId) g.semCategoria += 1;
    if (m.data > g.ultimaData) g.ultimaData = m.data;
    // Linha com nome de exibição ou categoria representa melhor o grupo.
    if ((m.nomeExibicao && !g.exemplo.nomeExibicao) || (m.categoriaId && !g.exemplo.categoriaId)) g.exemplo = m;
    g.descricoes.set(m.descricao, (g.descricoes.get(m.descricao) ?? 0) + 1);
  }

  return [...grupos.values()]
    .map(({ descricoes, ...g }) => ({
      ...g,
      descricao: [...descricoes.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort(
      (a, b) =>
        Number(a.sentido === "entrada") - Number(b.sentido === "entrada") ||
        b.quantidade - a.quantidade ||
        Math.abs(b.totalCentavos) - Math.abs(a.totalCentavos)
    );
}
