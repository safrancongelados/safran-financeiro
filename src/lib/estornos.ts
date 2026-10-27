/**
 * Estornos: um pagamento que falhou ou foi cancelado vira dois lançamentos
 * efetivados no extrato — a saída e a volta do dinheiro. Como caixa os dois
 * estão certos (o dinheiro saiu e voltou), mas na DRE precisam se anular, e
 * não se anulam sozinhos: a saída cai na despesa original e a volta cairia em
 * receita. Aqui a volta é pareada com a ida e herda a categoria dela, para
 * reduzir a mesma linha que a ida aumentou. Sem I/O.
 */
import { normalizarTexto } from "./regras";

/**
 * Como o banco descreve a volta do dinheiro. Casam com a descrição já
 * normalizada (sem acento, minúscula). "Transferência cancelada" entra porque
 * é o estorno de uma transferência enviada que não chegou a ser efetivada.
 */
const PADROES_ESTORNO = [
  "reembolso de ",
  "estorno",
  "cancelad", // "pagamento cancelado", "- cancelado", "liberação de dinheiro cancelada venda cancelada"
  "devolucao de ",
];

export function eEstorno(descricao: string): boolean {
  const d = normalizarTexto(descricao);
  return PADROES_ESTORNO.some((p) => d.includes(p));
}

/** Quantos dias antes do estorno a ida pode ter acontecido. Boleto e Pix voltam no dia ou em poucos dias. */
export const JANELA_DIAS = 10;

export interface MovimentacaoParaParear {
  id: string;
  contaId: string;
  /** YYYY-MM-DD */
  data: string;
  descricao: string;
  valorCentavos: number;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function palavras(texto: string): Set<string> {
  return new Set(normalizarTexto(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
}

function palavrasEmComum(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const p of a) if (b.has(p)) n++;
  return n;
}

/**
 * Para cada estorno, a ida: na mesma conta, mesmo valor com sinal trocado,
 * nos `JANELA_DIAS` dias anteriores (ou no mesmo dia) e que não seja ela
 * própria um estorno. Entre várias candidatas, a mais próxima no tempo e,
 * no empate, a que mais palavras divide com o estorno (o nome de quem
 * recebeu, o tipo do boleto). Cada ida é usada por um estorno só: três
 * tentativas de DARF estornadas três vezes viram três pares.
 *
 * Devolve `id do estorno → id da ida`. Estorno sem ida encontrada fica de fora
 * e segue o caminho normal das regras.
 */
export function parearEstornos(movimentacoes: MovimentacaoParaParear[]): Map<string, string> {
  const estornos: MovimentacaoParaParear[] = [];
  const idasPorChave = new Map<string, MovimentacaoParaParear[]>();
  for (const m of movimentacoes) {
    if (eEstorno(m.descricao)) {
      estornos.push(m);
    } else {
      const chave = `${m.contaId}|${-m.valorCentavos}`;
      const lista = idasPorChave.get(chave) ?? [];
      lista.push(m);
      idasPorChave.set(chave, lista);
    }
  }

  // Estornos mais antigos escolhem primeiro: a ida de julho não pode ser
  // tomada por um estorno de setembro antes de o estorno de julho olhar.
  estornos.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const usadas = new Set<string>();
  const pares = new Map<string, string>();
  for (const estorno of estornos) {
    const candidatas = idasPorChave.get(`${estorno.contaId}|${estorno.valorCentavos}`);
    if (!candidatas) continue;
    const termos = palavras(estorno.descricao);
    let melhor: { id: string; dias: number; comum: number } | null = null;
    for (const ida of candidatas) {
      if (usadas.has(ida.id)) continue;
      const dias = diasEntre(ida.data, estorno.data);
      if (dias < 0 || dias > JANELA_DIAS) continue;
      const comum = palavrasEmComum(termos, palavras(ida.descricao));
      if (!melhor || dias < melhor.dias || (dias === melhor.dias && comum > melhor.comum)) {
        melhor = { id: ida.id, dias, comum };
      }
    }
    if (melhor) {
      usadas.add(melhor.id);
      pares.set(estorno.id, melhor.id);
    }
  }
  return pares;
}
