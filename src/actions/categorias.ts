"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  campoRegraEnum,
  categorias,
  grupoDreEnum,
  movimentacoesBancarias,
  regrasCategorizacao,
  sentidoRegraEnum,
} from "@/db/schema";
import { obterSessao } from "@/lib/auth";
import { aplicarRegras } from "@/lib/categorizacao";
import { eViolacaoDeUnicidade } from "@/lib/db-erros";
import { normalizarTexto, regraAPartirDe, regraCasa } from "@/lib/regras";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

function revalidarTudo() {
  // Categoria mexe no extrato, na DRE e no fluxo de caixa de uma vez.
  revalidatePath("/", "layout");
}

async function buscarMovimentacao(id: string) {
  const [mov] = await db
    .select({
      id: movimentacoesBancarias.id,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
    })
    .from(movimentacoesBancarias)
    .where(eq(movimentacoesBancarias.id, id))
    .limit(1);
  return mov;
}

export interface ResultadoCategorizacao {
  erro?: string;
  /** Quando dá para virar regra: quantas outras movimentações ela pegaria hoje. */
  sugestao?: { rotulo: string; outras: number };
}

/**
 * Categoriza uma movimentação à mão (ou tira a categoria, com null). A escolha
 * manual nunca é desfeita por regra.
 */
export async function categorizarAction(
  movimentacaoId: string,
  categoriaId: string | null
): Promise<ResultadoCategorizacao> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (!uuid.safeParse(movimentacaoId).success || (categoriaId && !uuid.safeParse(categoriaId).success)) {
    return { erro: "Dados inválidos." };
  }

  const mov = await buscarMovimentacao(movimentacaoId);
  if (!mov) return { erro: "Movimentação não encontrada." };

  await db
    .update(movimentacoesBancarias)
    .set({ categoriaId, categorizadaPor: categoriaId ? "manual" : null, updatedAt: new Date() })
    .where(eq(movimentacoesBancarias.id, movimentacaoId));

  // Sem categoria manual, volta a valer o que as regras disserem.
  if (!categoriaId) await aplicarRegras();
  revalidarTudo();

  const regra = categoriaId ? regraAPartirDe(mov) : null;
  if (!regra) return {};

  // Quantas outras a regra pegaria: as que ainda não têm a mesma categoria e
  // não foram escolhidas à mão.
  const candidatas = await db
    .select({
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
    })
    .from(movimentacoesBancarias)
    .where(
      and(
        ne(movimentacoesBancarias.id, movimentacaoId),
        or(isNull(movimentacoesBancarias.categoriaId), ne(movimentacoesBancarias.categoriaId, categoriaId!)),
        or(isNull(movimentacoesBancarias.categorizadaPor), ne(movimentacoesBancarias.categorizadaPor, "manual"))
      )
    );
  const outras = candidatas.filter((c) => regraCasa({ id: "", categoriaId: categoriaId!, ...regra }, c)).length;

  const quem = mov.contraparte?.trim() || mov.descricao;
  return { sugestao: { rotulo: quem, outras } };
}

/**
 * "Aplicar a todas desta contraparte": transforma a escolha feita numa
 * movimentação em regra, que vale para o passado e para o que vier no sync.
 */
export async function criarRegraAction(movimentacaoId: string, categoriaId: string): Promise<{ erro?: string; alteradas?: number }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (!uuid.safeParse(movimentacaoId).success || !uuid.safeParse(categoriaId).success) return { erro: "Dados inválidos." };

  const mov = await buscarMovimentacao(movimentacaoId);
  if (!mov) return { erro: "Movimentação não encontrada." };
  const regra = regraAPartirDe(mov);
  if (!regra) return { erro: "Essa movimentação não tem contraparte nem descrição para virar regra." };

  // Mesma contraparte e sentido com outra categoria: a regra nova substitui.
  await db
    .insert(regrasCategorizacao)
    .values({ categoriaId, ...regra })
    .onConflictDoUpdate({
      target: [regrasCategorizacao.campo, regrasCategorizacao.padrao, regrasCategorizacao.sentido],
      set: { categoriaId },
    });

  const alteradas = await aplicarRegras();
  revalidarTudo();
  return { alteradas };
}

export async function excluirRegraAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  await db.delete(regrasCategorizacao).where(eq(regrasCategorizacao.id, id));
  // O que a regra tinha categorizado volta para sem categoria (ou para outra regra que case).
  await aplicarRegras();
  revalidarTudo();
}

export interface CategoriaFormState {
  erro?: string;
  ok?: string;
}

const categoriaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria."),
  grupo: z.enum(grupoDreEnum.enumValues, { message: "Escolha o grupo da DRE." }),
  ativa: z.boolean(),
});

/** Cria (id null) ou atualiza uma categoria do plano de contas. */
export async function salvarCategoriaAction(
  id: string | null,
  _prev: CategoriaFormState,
  formData: FormData
): Promise<CategoriaFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (id && !uuid.safeParse(id).success) return { erro: "Categoria inválida." };

  const parsed = categoriaSchema.safeParse({
    nome: formData.get("nome") ?? "",
    grupo: formData.get("grupo") ?? "",
    ativa: id ? formData.get("ativa") === "on" : true,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    if (id) {
      await db.update(categorias).set(parsed.data).where(eq(categorias.id, id));
    } else {
      // Entra no fim do grupo na DRE.
      await db.insert(categorias).values({ ...parsed.data, ordem: 9999 });
    }
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe uma categoria com esse nome." };
    throw err;
  }

  revalidarTudo();
  return { ok: id ? "Categoria atualizada." : "Categoria criada." };
}

const regraSchema = z.object({
  campo: z.enum(campoRegraEnum.enumValues),
  padrao: z.string().trim().min(3, "O texto da regra precisa de ao menos 3 caracteres."),
  sentido: z.enum(sentidoRegraEnum.enumValues),
  categoriaId: uuid,
});

/**
 * Regra escrita à mão, para o que "aplicar a todas" não resolve — por
 * exemplo, todo Pix recebido de cliente é venda, mas cada cliente é uma
 * contraparte diferente.
 */
export async function criarRegraManualAction(_prev: CategoriaFormState, formData: FormData): Promise<CategoriaFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };

  const parsed = regraSchema.safeParse({
    campo: formData.get("campo"),
    padrao: formData.get("padrao") ?? "",
    sentido: formData.get("sentido"),
    categoriaId: formData.get("categoriaId"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { campo, sentido, categoriaId } = parsed.data;
  // Mesma normalização que a comparação usa, senão a regra nunca casa.
  const padrao = campo === "documento" ? parsed.data.padrao.replace(/\D/g, "") : normalizarTexto(parsed.data.padrao);
  if (campo === "documento" && !/^(\d{11}|\d{14})$/.test(padrao)) {
    return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo." };
  }

  await db
    .insert(regrasCategorizacao)
    .values({ campo, padrao, sentido, categoriaId })
    .onConflictDoUpdate({
      target: [regrasCategorizacao.campo, regrasCategorizacao.padrao, regrasCategorizacao.sentido],
      set: { categoriaId },
    });

  const alteradas = await aplicarRegras();
  revalidarTudo();
  return { ok: `Regra criada. ${alteradas} movimentação(ões) categorizada(s).` };
}
