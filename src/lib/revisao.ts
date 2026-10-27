/**
 * A caixa de revisão: o que está sem categoria, agrupado por iguais, com a
 * categoria sugerida a partir do que já foi categorizado antes. Sem I/O.
 *
 * A sugestão procura, entre as linhas já categorizadas, as que parecem com
 * o grupo — mesmo CPF/CNPJ, senão mesma contraparte, senão a descrição
 * começando igual (as três primeiras palavras, onde o banco põe o tipo do
 * lançamento) — e fica com a categoria mais frequente entre elas.
 */
import { agruparIguais, type GrupoIguais, type MovimentacaoAgrupavel } from "./extrato";
import { documentoCompleto, normalizarTexto, sentidoDe } from "./regras";

export interface Categorizada {
  valorCentavos: number;
  contraparte: string | null;
  contraparteDocumento: string | null;
  descricao: string;
  categoriaId: string;
}

export interface Sugestao {
  categoriaId: string;
  /** "mesmo CNPJ", "mesma contraparte", "descrição parecida". */
  motivo: string;
  /** Quantas linhas já categorizadas sustentam a sugestão. */
  apoio: number;
}

export interface GrupoParaRevisar<M extends MovimentacaoAgrupavel> extends GrupoIguais<M> {
  sugestao: Sugestao | null;
}

function prefixo(descricao: string): string {
  return normalizarTexto(descricao).split(" ").slice(0, 3).join(" ");
}

function maisFrequente(itens: Categorizada[]): { categoriaId: string; apoio: number } | null {
  if (itens.length === 0) return null;
  const contagem = new Map<string, number>();
  for (const i of itens) contagem.set(i.categoriaId, (contagem.get(i.categoriaId) ?? 0) + 1);
  const [categoriaId, apoio] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  return { categoriaId, apoio };
}

/** Índices das linhas já categorizadas, por sentido, para a sugestão sair rápido. */
export function indexarCategorizadas(categorizadas: Categorizada[]) {
  const porDocumento = new Map<string, Categorizada[]>();
  const porContraparte = new Map<string, Categorizada[]>();
  const porPrefixo = new Map<string, Categorizada[]>();
  const add = (mapa: Map<string, Categorizada[]>, chave: string, c: Categorizada) => {
    const lista = mapa.get(chave) ?? [];
    lista.push(c);
    mapa.set(chave, lista);
  };
  for (const c of categorizadas) {
    const s = sentidoDe(c.valorCentavos);
    if (documentoCompleto(c.contraparteDocumento)) add(porDocumento, `${s}|${c.contraparteDocumento}`, c);
    const nome = c.contraparte ? normalizarTexto(c.contraparte) : "";
    if (nome.length >= 3) add(porContraparte, `${s}|${nome}`, c);
    add(porPrefixo, `${s}|${prefixo(c.descricao)}`, c);
  }
  return { porDocumento, porContraparte, porPrefixo };
}

export function sugerir(
  mov: Pick<Categorizada, "valorCentavos" | "contraparte" | "contraparteDocumento" | "descricao">,
  indice: ReturnType<typeof indexarCategorizadas>
): Sugestao | null {
  const s = sentidoDe(mov.valorCentavos);
  if (documentoCompleto(mov.contraparteDocumento)) {
    const r = maisFrequente(indice.porDocumento.get(`${s}|${mov.contraparteDocumento}`) ?? []);
    if (r) return { ...r, motivo: "mesmo CPF/CNPJ" };
  }
  const nome = mov.contraparte ? normalizarTexto(mov.contraparte) : "";
  if (nome.length >= 3) {
    const r = maisFrequente(indice.porContraparte.get(`${s}|${nome}`) ?? []);
    if (r) return { ...r, motivo: "mesma contraparte" };
  }
  const r = maisFrequente(indice.porPrefixo.get(`${s}|${prefixo(mov.descricao)}`) ?? []);
  // Prefixo genérico ("pix enviado maria") sustenta pouco: só vale com apoio.
  if (r && r.apoio >= 2) return { ...r, motivo: "descrição parecida" };
  return null;
}

/** Os grupos sem categoria, com a sugestão de cada um; os com sugestão primeiro. */
export function gruposParaRevisar<M extends MovimentacaoAgrupavel>(
  semCategoria: M[],
  categorizadas: Categorizada[]
): GrupoParaRevisar<M>[] {
  const indice = indexarCategorizadas(categorizadas);
  return agruparIguais(semCategoria)
    .map((g) => ({ ...g, sugestao: sugerir(g.exemplo, indice) }))
    .sort((a, b) => Number(Boolean(b.sugestao)) - Number(Boolean(a.sugestao)) || b.quantidade - a.quantidade);
}
