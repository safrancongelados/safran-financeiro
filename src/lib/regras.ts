/**
 * Motor de categorização automática. Sem I/O: decide, para uma movimentação,
 * de qual regra vem a categoria, o nome de exibição e o centro de custo — é
 * aqui que mora a ordem de precedência.
 */
import type { CampoRegra, SentidoRegra } from "@/db/schema";

export interface RegraAplicavel {
  id: string;
  /** Cada um destes é opcional: uma regra pode só dar nome, por exemplo. */
  categoriaId: string | null;
  nomeExibicao: string | null;
  centroCustoId: string | null;
  campo: CampoRegra;
  padrao: string;
  sentido: SentidoRegra;
}

export interface MovimentacaoParaRegra {
  valorCentavos: number;
  contraparte: string | null;
  contraparteDocumento: string | null;
  descricao: string;
}

/** Sem acento, minúsculo e com espaço simples: "ATACADÃO  S.A" casa com "atacadao s.a". */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sentidoDe(valorCentavos: number): "entrada" | "saida" {
  return valorCentavos >= 0 ? "entrada" : "saida";
}

/** CPF ou CNPJ completo. Documento mascarado pelo banco ("***456789**") não serve de chave. */
export function documentoCompleto(doc: string | null): doc is string {
  return doc !== null && /^(\d{11}|\d{14})$/.test(doc);
}

export function regraCasa(regra: RegraAplicavel, mov: MovimentacaoParaRegra): boolean {
  if (regra.sentido !== "ambos" && regra.sentido !== sentidoDe(mov.valorCentavos)) return false;
  switch (regra.campo) {
    case "documento":
      return mov.contraparteDocumento === regra.padrao;
    case "contraparte":
      return mov.contraparte !== null && normalizarTexto(mov.contraparte).includes(regra.padrao);
    case "descricao":
      return normalizarTexto(mov.descricao).includes(regra.padrao);
  }
}

const PESO_CAMPO: Record<CampoRegra, number> = { documento: 0, contraparte: 1, descricao: 2 };

/**
 * A regra mais específica vence: documento antes de nome, nome antes de
 * descrição; regra de um sentido só antes de "ambos"; trecho mais longo antes
 * do mais curto. Assim "mercado pago tarifa" ganha de "mercado pago".
 */
export function ordenarRegras<R extends RegraAplicavel>(regras: R[]): R[] {
  return [...regras].sort(
    (a, b) =>
      PESO_CAMPO[a.campo] - PESO_CAMPO[b.campo] ||
      Number(a.sentido === "ambos") - Number(b.sentido === "ambos") ||
      b.padrao.length - a.padrao.length
  );
}

export interface Resolucao<R> {
  categoria: R | null;
  nome: R | null;
  centro: R | null;
}

/**
 * Cada atributo vem da primeira regra, na ordem de precedência, que casa com
 * a movimentação e define aquele atributo. Assim "Pix enviado José…" pode ter
 * o nome de uma regra da pessoa e a categoria de uma regra mais geral.
 *
 * Recebe as regras já ordenadas (`ordenarRegras`), para não reordenar a cada linha.
 */
export function resolverRegras<R extends RegraAplicavel>(mov: MovimentacaoParaRegra, regrasOrdenadas: R[]): Resolucao<R> {
  const r: Resolucao<R> = { categoria: null, nome: null, centro: null };
  for (const regra of regrasOrdenadas) {
    if (r.categoria && r.nome && r.centro) break;
    if (!regraCasa(regra, mov)) continue;
    if (!r.categoria && regra.categoriaId) r.categoria = regra;
    if (!r.nome && regra.nomeExibicao) r.nome = regra;
    if (!r.centro && regra.centroCustoId) r.centro = regra;
  }
  return r;
}

/**
 * A identidade de uma movimentação: o que faz outra linha ser "igual" a ela.
 * Editar nome, categoria ou centro no extrato grava numa regra com esta
 * identidade, que vale para as iguais — passadas e futuras. CPF/CNPJ completo
 * primeiro, depois contraparte, depois a descrição inteira. Vale só no mesmo
 * sentido: o mesmo fornecedor pode devolver dinheiro, e devolução não é despesa.
 */
export function regraAPartirDe(
  mov: MovimentacaoParaRegra
): { campo: CampoRegra; padrao: string; sentido: "entrada" | "saida" } | null {
  const sentido = sentidoDe(mov.valorCentavos);
  if (documentoCompleto(mov.contraparteDocumento)) {
    return { campo: "documento", padrao: mov.contraparteDocumento, sentido };
  }
  const nome = mov.contraparte ? normalizarTexto(mov.contraparte) : "";
  if (nome.length >= 3) return { campo: "contraparte", padrao: nome, sentido };
  const descricao = normalizarTexto(mov.descricao);
  if (descricao.length >= 3 && descricao !== "(sem descricao)") return { campo: "descricao", padrao: descricao, sentido };
  return null;
}
