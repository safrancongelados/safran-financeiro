"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { movimentacoesBancarias, pessoas, tipoPessoaEnum } from "@/db/schema";
import { registrar } from "@/lib/auditoria";
import { aplicarRegras } from "@/lib/categorizacao";
import { eViolacaoDeUnicidade } from "@/lib/db-erros";
import { exigirEdicao } from "@/lib/permissoes";
import { identificadorDe, lerPadroes, normalizarDocumento } from "@/lib/pessoas";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export interface PessoaFormState {
  erro?: string;
  ok?: string;
  /** Depois de criar, a tela vai para a pessoa. */
  id?: string;
}

function revalidarTudo() {
  // Pessoa muda o extrato (quem é quem, categoria padrão), os relatórios e a DRE.
  revalidatePath("/", "layout");
}

const pessoaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(80, "Nome muito longo."),
  tipo: z.enum(tipoPessoaEnum.enumValues),
  categoriaId: uuid.nullable(),
  metaMensalCentavos: z.number().int().nonnegative().nullable(),
  ativa: z.boolean(),
  notas: z
    .string()
    .trim()
    .max(500, "Notas muito longas.")
    .transform((v) => v || null),
});

/** "1.234,56" → 123456; vazio → null. */
function lerReais(v: FormDataEntryValue | null): number | null | undefined {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** Cria (id null) ou edita uma pessoa. Padrões e documento ensinam o sync a reconhecê-la. */
export async function salvarPessoaAction(id: string | null, _prev: PessoaFormState, formData: FormData): Promise<PessoaFormState> {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return { erro: acesso.erro };
  if (id && !uuid.safeParse(id).success) return { erro: "Pessoa inválida." };

  const meta = lerReais(formData.get("metaMensal"));
  if (meta === undefined) return { erro: "Meta mensal inválida." };
  const parsed = pessoaSchema.safeParse({
    nome: formData.get("nome") ?? "",
    tipo: formData.get("tipo"),
    categoriaId: formData.get("categoriaId") ? String(formData.get("categoriaId")) : null,
    metaMensalCentavos: meta,
    ativa: id ? formData.get("ativa") === "on" : true,
    notas: formData.get("notas") ?? "",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const doc = normalizarDocumento(String(formData.get("documento") ?? ""));
  if (!doc.ok) return { erro: "CPF precisa de 11 dígitos e CNPJ de 14." };
  const padroes = lerPadroes(String(formData.get("padroes") ?? ""));
  if (!doc.documento && padroes.length === 0) {
    return { erro: "Informe o CPF/CNPJ ou ao menos um trecho do nome como o banco escreve, para reconhecer os lançamentos." };
  }

  const dados = { ...parsed.data, documento: doc.documento, padroes, updatedAt: new Date() };
  let pessoaId = id;
  try {
    if (id) {
      await db.update(pessoas).set(dados).where(eq(pessoas.id, id));
    } else {
      const [nova] = await db.insert(pessoas).values(dados).returning({ id: pessoas.id });
      pessoaId = nova.id;
    }
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe uma pessoa com esse CPF/CNPJ." };
    throw err;
  }

  await registrar(acesso.sessao, { acao: id ? "editar" : "criar", alvoTipo: "pessoa", alvoId: pessoaId, detalhe: { nome: dados.nome, tipo: dados.tipo } });
  const alteradas = await aplicarRegras();
  revalidarTudo();
  return {
    ok: `${id ? "Pessoa salva" : "Pessoa criada"}.${alteradas ? ` ${alteradas} lançamento(s) mudaram de categoria.` : ""}`,
    id: pessoaId ?? undefined,
  };
}

/** Apagar desfaz o vínculo dos lançamentos (o banco faz isso) e recalcula o que a categoria padrão decidia. */
export async function excluirPessoaAction(formData: FormData) {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return;
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  const [p] = await db.delete(pessoas).where(eq(pessoas.id, id)).returning({ nome: pessoas.nome });
  if (!p) return;
  await registrar(acesso.sessao, { acao: "apagar", alvoTipo: "pessoa", alvoId: id, detalhe: { nome: p.nome } });
  await aplicarRegras();
  revalidarTudo();
}

/**
 * Vincula lançamentos a uma pessoa ensinando a ela como reconhecê-los: o
 * CPF/CNPJ, se completo, senão o nome da contraparte, senão a descrição. Vale
 * para os lançamentos escolhidos e para todos os iguais, passados e futuros.
 */
export async function vincularPessoaAction(
  movimentacaoIds: string[],
  pessoaId: string
): Promise<{ erro?: string; vinculados?: number; pessoaNome?: string }> {
  const acesso = await exigirEdicao();
  if ("erro" in acesso) return { erro: acesso.erro };
  const ids = movimentacaoIds.filter((id) => uuid.safeParse(id).success).slice(0, 500);
  if (ids.length === 0 || !uuid.safeParse(pessoaId).success) return { erro: "Dados inválidos." };

  const [pessoa] = await db.select().from(pessoas).where(eq(pessoas.id, pessoaId)).limit(1);
  if (!pessoa) return { erro: "Pessoa não encontrada." };

  const movs = await db
    .select({
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
    })
    .from(movimentacoesBancarias)
    .where(inArray(movimentacoesBancarias.id, ids));

  let documento = pessoa.documento;
  const padroes = new Set(pessoa.padroes);
  for (const m of movs) {
    const ident = identificadorDe(m);
    if (!ident) continue;
    // Só um documento por pessoa: o primeiro completo fica; os outros viram padrão pelo nome.
    if ("documento" in ident) {
      if (!documento) documento = ident.documento;
      else if (documento !== ident.documento && m.contraparte) padroes.add(m.contraparte.toLowerCase());
    } else {
      padroes.add(ident.padrao);
    }
  }

  try {
    await db
      .update(pessoas)
      .set({ documento, padroes: [...padroes], updatedAt: new Date() })
      .where(eq(pessoas.id, pessoa.id));
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Esse CPF/CNPJ já está em outra pessoa." };
    throw err;
  }
  await registrar(acesso.sessao, { acao: "vincular", alvoTipo: "pessoa", alvoId: pessoa.id, detalhe: { lancamentos: ids.length } });
  await aplicarRegras();
  revalidarTudo();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(movimentacoesBancarias)
    .where(eq(movimentacoesBancarias.pessoaId, pessoa.id));
  return { vinculados: n, pessoaNome: pessoa.nome };
}
