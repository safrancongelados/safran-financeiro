/**
 * Motor de categorização automática. Sem I/O: decide, para uma movimentação,
 * qual regra vale — é aqui que mora a ordem de precedência.
 */
import type { CampoRegra, SentidoRegra } from "@/db/schema";

export interface RegraAplicavel {
  id: string;
  categoriaId: string;
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

/** Recebe as regras já ordenadas (`ordenarRegras`), para não reordenar a cada linha. */
export function escolherRegra<R extends RegraAplicavel>(mov: MovimentacaoParaRegra, regrasOrdenadas: R[]): R | null {
  return regrasOrdenadas.find((r) => regraCasa(r, mov)) ?? null;
}

/**
 * A regra que "aplicar a todas desta contraparte" cria a partir de uma
 * movimentação. Vale só no mesmo sentido: o mesmo fornecedor pode devolver
 * dinheiro, e devolução não é despesa.
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
