/**
 * Como uma movimentação é ligada a uma pessoa do cadastro. Sem I/O.
 *
 * CPF/CNPJ completo decide sozinho; sem documento (o Open Finance mascara
 * CPF com "*"), vale um trecho do nome que o banco manda — na contraparte ou,
 * quando ela vem vazia, na própria descrição ("Pix enviado Maria Luisinha").
 */
import type { TipoPessoa } from "@/db/schema";
import { documentoCompleto, normalizarTexto } from "./regras";

export const TIPO_PESSOA_LABEL: Record<TipoPessoa, string> = {
  funcionario: "Funcionário",
  socio: "Sócio",
  fornecedor: "Fornecedor",
  cliente: "Cliente",
  outro: "Outro",
};

export const TIPOS_PESSOA = Object.keys(TIPO_PESSOA_LABEL) as TipoPessoa[];

export interface PessoaReconhecivel {
  id: string;
  documento: string | null;
  padroes: string[];
  ativa: boolean;
}

export interface MovimentacaoParaPessoa {
  contraparte: string | null;
  contraparteDocumento: string | null;
  descricao: string;
}

/** Índice para reconhecer rápido: documento exato e padrões ordenados do mais longo ao mais curto. */
export function indexarPessoas<P extends PessoaReconhecivel>(pessoas: P[]) {
  const ativas = pessoas.filter((p) => p.ativa);
  const porDocumento = new Map<string, P>();
  const porPadrao: { padrao: string; pessoa: P }[] = [];
  for (const p of ativas) {
    if (p.documento) porDocumento.set(p.documento, p);
    for (const padrao of p.padroes) {
      const n = normalizarTexto(padrao);
      if (n.length >= 3) porPadrao.push({ padrao: n, pessoa: p });
    }
  }
  // Trecho mais longo primeiro: "maria luisinha silva" antes de "maria".
  porPadrao.sort((a, b) => b.padrao.length - a.padrao.length);
  return { porDocumento, porPadrao };
}

export function reconhecerPessoa<P extends PessoaReconhecivel>(
  mov: MovimentacaoParaPessoa,
  indice: ReturnType<typeof indexarPessoas<P>>
): P | null {
  if (mov.contraparteDocumento && indice.porDocumento.has(mov.contraparteDocumento)) {
    return indice.porDocumento.get(mov.contraparteDocumento)!;
  }
  if (indice.porPadrao.length === 0) return null;
  const contraparte = mov.contraparte ? normalizarTexto(mov.contraparte) : "";
  const descricao = normalizarTexto(mov.descricao);
  for (const { padrao, pessoa } of indice.porPadrao) {
    if (contraparte.includes(padrao) || descricao.includes(padrao)) return pessoa;
  }
  return null;
}

/**
 * O que ensinar a uma pessoa para ela reconhecer esta movimentação daqui em
 * diante: o documento, se completo; senão o nome da contraparte; senão a
 * descrição sem o tipo do lançamento ("Pix enviado ").
 */
export function identificadorDe(mov: MovimentacaoParaPessoa): { documento: string } | { padrao: string } | null {
  if (documentoCompleto(mov.contraparteDocumento)) return { documento: mov.contraparteDocumento };
  const nome = mov.contraparte ? normalizarTexto(mov.contraparte) : "";
  if (nome.length >= 3) return { padrao: nome };
  const descricao = normalizarTexto(mov.descricao).replace(
    /^(transferencia )?(pix|ted|doc)? ?(enviad[oa]|recebid[oa])( com qr pix)? ?/,
    ""
  );
  if (descricao.length >= 3) return { padrao: descricao };
  return null;
}

/** Só dígitos; vazio vira nulo. Rejeita o que não é CPF nem CNPJ completo. */
export function normalizarDocumento(bruto: string | null | undefined): { ok: true; documento: string | null } | { ok: false } {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return { ok: true, documento: null };
  if (!/^(\d{11}|\d{14})$/.test(digitos)) return { ok: false };
  return { ok: true, documento: digitos };
}

/** Lê os padrões digitados num textarea, um por linha ou separados por ";". */
export function lerPadroes(texto: string): string[] {
  return [...new Set(texto.split(/[\n;]/).map((p) => normalizarTexto(p)).filter((p) => p.length >= 3))];
}
