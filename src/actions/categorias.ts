"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campoRegraEnum, movimentacoesBancarias, regrasCategorizacao, sentidoRegraEnum } from "@/db/schema";
import { obterSessao } from "@/lib/auth";
import { aplicarRegras } from "@/lib/categorizacao";
import { normalizarTexto, regraAPartirDe, regraCasa } from "@/lib/regras";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const uuidOuNulo = uuid.nullable();

function revalidarTudo() {
  // Categoria, nome e centro mexem no extrato, na DRE e no fluxo de caixa de uma vez.
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
      categorizadaPor: movimentacoesBancarias.categorizadaPor,
    })
    .from(movimentacoesBancarias)
    .where(eq(movimentacoesBancarias.id, id))
    .limit(1);
  return mov;
}

/** Vazio vira nulo: sem nome, o extrato mostra a descrição do banco. */
const nomeExibicao = z
  .string()
  .trim()
  .max(80, "O nome pode ter até 80 caracteres.")
  .transform((v) => v || null);

/** Como a regra de identidade estava antes de uma edição — para o "Só nesta" desfazer. */
export type EstadoAnterior =
  | { regraId: string; nova: true }
  | { regraId: string; nova: false; categoriaId: string | null };

export interface ResultadoEdicao {
  erro?: string;
  /** Quantas outras linhas são "iguais" a esta e receberam a mesma mudança. */
  iguais?: number;
  desfazer?: EstadoAnterior;
}

const edicaoSchema = z.discriminatedUnion("campo", [
  z.object({ campo: z.literal("nome"), valor: z.string() }),
  z.object({ campo: z.literal("categoria"), valor: uuidOuNulo }),
  z.object({ campo: z.literal("centro"), valor: uuidOuNulo }),
]);
export type EdicaoLinha = z.input<typeof edicaoSchema>;

/**
 * Edição de uma linha do extrato — nome, categoria ou centro de custo — que
 * vale para todas as iguais (mesmo CPF/CNPJ, senão mesma contraparte, senão
 * mesma descrição, no mesmo sentido), passadas e futuras. Grava na regra de
 * identidade da linha, mexendo só no campo editado.
 *
 * Categoria nula tira a categoria da regra de identidade (volta a valer a
 * regra mais geral, se houver); centro nulo volta ao padrão da categoria;
 * nome vazio ou igual à descrição volta a mostrar a descrição do banco.
 */
export async function editarLinhaAction(movimentacaoId: string, edicao: EdicaoLinha): Promise<ResultadoEdicao> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  const parsed = edicaoSchema.safeParse(edicao);
  if (!uuid.safeParse(movimentacaoId).success || !parsed.success) return { erro: "Dados inválidos." };

  const mov = await buscarMovimentacao(movimentacaoId);
  if (!mov) return { erro: "Movimentação não encontrada." };

  const identidade = regraAPartirDe(mov);
  if (!identidade) {
    // Sem documento, contraparte nem descrição: não há como achar as iguais.
    if (parsed.data.campo !== "categoria") {
      return { erro: "Esta linha não tem documento, contraparte nem descrição para reconhecer as iguais." };
    }
    await db
      .update(movimentacoesBancarias)
      .set({ categoriaId: parsed.data.valor, categorizadaPor: parsed.data.valor ? "manual" : null, updatedAt: new Date() })
      .where(eq(movimentacoesBancarias.id, mov.id));
    await aplicarRegras();
    revalidarTudo();
    return { iguais: 0 };
  }

  let mudanca: Partial<typeof regrasCategorizacao.$inferInsert>;
  if (parsed.data.campo === "nome") {
    const nome = nomeExibicao.safeParse(parsed.data.valor);
    if (!nome.success) return { erro: nome.error.issues[0]?.message ?? "Nome inválido." };
    // Igual ao original é o mesmo que não ter nome.
    mudanca = { nomeExibicao: nome.data && nome.data !== mov.descricao.trim() ? nome.data : null };
  } else if (parsed.data.campo === "categoria") {
    mudanca = { categoriaId: parsed.data.valor };
  } else {
    mudanca = { centroCustoId: parsed.data.valor };
  }

  const [antes] = await db
    .select({ id: regrasCategorizacao.id, categoriaId: regrasCategorizacao.categoriaId })
    .from(regrasCategorizacao)
    .where(
      and(
        eq(regrasCategorizacao.campo, identidade.campo),
        eq(regrasCategorizacao.padrao, identidade.padrao),
        eq(regrasCategorizacao.sentido, identidade.sentido)
      )
    )
    .limit(1);

  const [regra] = await db
    .insert(regrasCategorizacao)
    .values({ ...identidade, ...mudanca })
    .onConflictDoUpdate({
      target: [regrasCategorizacao.campo, regrasCategorizacao.padrao, regrasCategorizacao.sentido],
      set: mudanca,
    })
    .returning();

  // Regra que ficou sem nada para decidir não serve para nada.
  if (!regra.categoriaId && !regra.nomeExibicao && !regra.centroCustoId) {
    await db.delete(regrasCategorizacao).where(eq(regrasCategorizacao.id, regra.id));
  }

  // Editar a categoria desta linha a tira da exceção manual: agora ela segue as iguais.
  if (parsed.data.campo === "categoria" && mov.categorizadaPor === "manual") {
    await db
      .update(movimentacoesBancarias)
      .set({ categorizadaPor: null, updatedAt: new Date() })
      .where(eq(movimentacoesBancarias.id, mov.id));
  }

  await aplicarRegras();
  revalidarTudo();

  const outras = await db
    .select({
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
    })
    .from(movimentacoesBancarias)
    .where(ne(movimentacoesBancarias.id, mov.id));
  const regraIdentidade = { id: regra.id, categoriaId: null, nomeExibicao: null, centroCustoId: null, ...identidade };
  const iguais = outras.filter((o) => regraCasa(regraIdentidade, o)).length;

  return {
    iguais,
    desfazer: antes ? { regraId: antes.id, nova: false, categoriaId: antes.categoriaId } : { regraId: regra.id, nova: true },
  };
}

const desfazerSchema = z.discriminatedUnion("nova", [
  z.object({ regraId: uuid, nova: z.literal(true) }),
  z.object({ regraId: uuid, nova: z.literal(false), categoriaId: uuidOuNulo }),
]);

/**
 * "Só nesta": a categoria escolhida vale só para esta linha. Devolve a
 * categoria da regra de identidade ao que era antes e marca a linha como
 * escolha manual, que regra nenhuma muda.
 */
export async function soNestaAction(
  movimentacaoId: string,
  categoriaId: string | null,
  desfazer: EstadoAnterior
): Promise<{ erro?: string }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  const d = desfazerSchema.safeParse(desfazer);
  if (!uuid.safeParse(movimentacaoId).success || !uuidOuNulo.safeParse(categoriaId).success || !d.success) {
    return { erro: "Dados inválidos." };
  }

  const [regra] = await db.select().from(regrasCategorizacao).where(eq(regrasCategorizacao.id, d.data.regraId)).limit(1);
  if (regra) {
    const categoriaAnterior = d.data.nova ? null : d.data.categoriaId;
    if (!categoriaAnterior && !regra.nomeExibicao && !regra.centroCustoId) {
      await db.delete(regrasCategorizacao).where(eq(regrasCategorizacao.id, regra.id));
    } else {
      await db.update(regrasCategorizacao).set({ categoriaId: categoriaAnterior }).where(eq(regrasCategorizacao.id, regra.id));
    }
  }

  await db
    .update(movimentacoesBancarias)
    .set({ categoriaId, categorizadaPor: categoriaId ? "manual" : null, updatedAt: new Date() })
    .where(eq(movimentacoesBancarias.id, movimentacaoId));

  await aplicarRegras();
  revalidarTudo();
  return {};
}

export async function excluirRegraAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  await db.delete(regrasCategorizacao).where(eq(regrasCategorizacao.id, id));
  // O que a regra decidia volta para o que as outras regras disserem.
  await aplicarRegras();
  revalidarTudo();
}

export interface RegraFormState {
  erro?: string;
  ok?: string;
}

/** Regra precisa decidir alguma coisa: categoria, nome ou centro. */
const atributosRegra = z
  .object({ categoriaId: uuidOuNulo, nomeExibicao, centroCustoId: uuidOuNulo })
  .refine((r) => r.categoriaId || r.nomeExibicao || r.centroCustoId, {
    message: "Escolha ao menos uma categoria, um nome ou um centro de custo.",
  });

const vazioParaNulo = (v: FormDataEntryValue | null) => (v ? String(v) : null);

const regraSchema = z.object({
  campo: z.enum(campoRegraEnum.enumValues),
  padrao: z.string().trim().min(3, "O texto da regra precisa de ao menos 3 caracteres."),
  sentido: z.enum(sentidoRegraEnum.enumValues),
});

/**
 * Regra escrita à mão, para o que a edição no extrato não resolve — por
 * exemplo, todo Pix recebido de cliente é venda, mas cada cliente é uma
 * contraparte diferente.
 */
export async function criarRegraManualAction(_prev: RegraFormState, formData: FormData): Promise<RegraFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };

  const base = regraSchema.safeParse({
    campo: formData.get("campo"),
    padrao: formData.get("padrao") ?? "",
    sentido: formData.get("sentido"),
  });
  if (!base.success) return { erro: base.error.issues[0]?.message ?? "Dados inválidos." };
  const attrs = atributosRegra.safeParse({
    categoriaId: vazioParaNulo(formData.get("categoriaId")),
    nomeExibicao: formData.get("nomeExibicao") ?? "",
    centroCustoId: vazioParaNulo(formData.get("centroCustoId")),
  });
  if (!attrs.success) return { erro: attrs.error.issues[0]?.message ?? "Dados inválidos." };

  const { campo, sentido } = base.data;
  // Mesma normalização que a comparação usa, senão a regra nunca casa.
  const padrao = campo === "documento" ? base.data.padrao.replace(/\D/g, "") : normalizarTexto(base.data.padrao);
  if (campo === "documento" && !/^(\d{11}|\d{14})$/.test(padrao)) {
    return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo." };
  }

  await db
    .insert(regrasCategorizacao)
    .values({ campo, padrao, sentido, ...attrs.data })
    .onConflictDoUpdate({
      target: [regrasCategorizacao.campo, regrasCategorizacao.padrao, regrasCategorizacao.sentido],
      set: attrs.data,
    });

  const alteradas = await aplicarRegras();
  revalidarTudo();
  return { ok: `Regra criada. ${alteradas} movimentação(ões) mudaram de categoria.` };
}

/**
 * Edição feita na tela de regras: categoria, nome de exibição e centro.
 * Sempre reaplica — qualquer um dos três muda o que o extrato e a DRE mostram.
 */
export async function atualizarRegraAction(
  id: string,
  dados: { categoriaId: string | null; nomeExibicao: string; centroCustoId: string | null }
): Promise<{ erro?: string; alteradas?: number }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (!uuid.safeParse(id).success) return { erro: "Regra inválida." };
  const attrs = atributosRegra.safeParse(dados);
  if (!attrs.success) return { erro: attrs.error.issues[0]?.message ?? "Dados inválidos." };

  const atualizadas = await db
    .update(regrasCategorizacao)
    .set(attrs.data)
    .where(eq(regrasCategorizacao.id, id))
    .returning({ id: regrasCategorizacao.id });
  if (atualizadas.length === 0) return { erro: "Regra não encontrada." };

  const alteradas = await aplicarRegras();
  revalidarTudo();
  return { alteradas };
}

/** Roda as regras sobre todo o extrato sem esperar o sync. */
export async function aplicarRegrasAction(): Promise<{ erro?: string; alteradas?: number }> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  const alteradas = await aplicarRegras();
  revalidarTudo();
  return { alteradas };
}
