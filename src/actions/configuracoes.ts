"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categorias, centrosCusto, linhasDre, secaoDreEnum, tipoLinhaDreEnum } from "@/db/schema";
import { obterSessao } from "@/lib/auth";
import { aplicarRegras } from "@/lib/categorizacao";
import { eViolacaoDeUnicidade } from "@/lib/db-erros";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export interface ConfigFormState {
  erro?: string;
  ok?: string;
}

function revalidarTudo() {
  // A estrutura mexe na DRE, no fluxo, no extrato e nos seletores de uma vez.
  revalidatePath("/", "layout");
}

const vazioParaNulo = (v: FormDataEntryValue | null) => (v ? String(v) : null);

/**
 * Troca um item de lugar com o vizinho e renumera a lista inteira de 10 em
 * 10 — assim nunca sobra empate de ordem para decidir quem vem primeiro.
 */
function reordenar(ids: string[], id: string, direcao: "cima" | "baixo"): string[] | null {
  const i = ids.indexOf(id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const novo = [...ids];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}

const movimento = z.object({ id: uuid, direcao: z.enum(["cima", "baixo"]) });

/**
 * Onde entra uma linha nova: na DRE, logo antes do último subtotal (assim ela
 * já conta no resultado final); fora da DRE, no fim.
 */
function posicaoDaNova(linhas: { tipo: string; secao: string }[], secao: string): number {
  if (secao !== "dre") return linhas.length;
  const ultimoSubtotal = linhas.findLastIndex((l) => l.secao === "dre" && l.tipo === "subtotal");
  if (ultimoSubtotal >= 0) return ultimoSubtotal;
  const ultimaDaDre = linhas.findLastIndex((l) => l.secao === "dre");
  return ultimaDaDre + 1;
}

// ── Linhas da DRE ──────────────────────────────────────────────────────────

const linhaSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da linha.").max(60, "Nome muito longo."),
    tipo: z.enum(tipoLinhaDreEnum.enumValues),
    secao: z.enum(secaoDreEnum.enumValues),
    basePercentual: z.boolean(),
    mostrarPercentual: z.boolean(),
  })
  .refine((l) => l.tipo === "grupo" || l.secao === "dre", { message: "Subtotal só existe dentro da DRE." });

/** Cria (id null) ou edita uma linha da DRE. O tipo (grupo ou subtotal) só se escolhe ao criar. */
export async function salvarLinhaAction(id: string | null, _prev: ConfigFormState, formData: FormData): Promise<ConfigFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (id && !uuid.safeParse(id).success) return { erro: "Linha inválida." };

  const atual = id ? (await db.select().from(linhasDre).where(eq(linhasDre.id, id)).limit(1))[0] : undefined;
  if (id && !atual) return { erro: "Linha não encontrada." };

  const parsed = linhaSchema.safeParse({
    nome: formData.get("nome") ?? "",
    tipo: atual?.tipo ?? formData.get("tipo"),
    secao: formData.get("secao"),
    basePercentual: formData.get("basePercentual") === "on",
    mostrarPercentual: formData.get("mostrarPercentual") === "on",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const dados = { ...parsed.data, mostrarPercentual: parsed.data.tipo === "subtotal" && parsed.data.mostrarPercentual };

  try {
    await db.transaction(async (tx) => {
      // Só uma linha é o 100% dos percentuais.
      if (dados.basePercentual) {
        await tx
          .update(linhasDre)
          .set({ basePercentual: false })
          .where(id ? ne(linhasDre.id, id) : sql`true`);
      }
      if (id) {
        await tx.update(linhasDre).set(dados).where(eq(linhasDre.id, id));
      } else {
        const existentes = await tx
          .select({ id: linhasDre.id, tipo: linhasDre.tipo, secao: linhasDre.secao })
          .from(linhasDre)
          .orderBy(asc(linhasDre.ordem), asc(linhasDre.nome));
        const [nova] = await tx.insert(linhasDre).values({ ...dados, ordem: 0 }).returning({ id: linhasDre.id });
        const ids = existentes.map((l) => l.id);
        ids.splice(posicaoDaNova(existentes, dados.secao), 0, nova.id);
        for (const [i, lid] of ids.entries()) await tx.update(linhasDre).set({ ordem: (i + 1) * 10 }).where(eq(linhasDre.id, lid));
      }
    });
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe uma linha com esse nome." };
    throw err;
  }

  revalidarTudo();
  return {
    ok: id
      ? "Linha salva."
      : dados.secao === "dre"
        ? "Linha criada logo antes do resultado final — use as setas para posicionar."
        : "Linha criada no fim — use as setas para posicionar.",
  };
}

export async function moverLinhaAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const m = movimento.safeParse({ id: formData.get("id"), direcao: formData.get("direcao") });
  if (!m.success) return;
  const linhas = await db.select({ id: linhasDre.id }).from(linhasDre).orderBy(asc(linhasDre.ordem), asc(linhasDre.nome));
  const nova = reordenar(
    linhas.map((l) => l.id),
    m.data.id,
    m.data.direcao
  );
  if (!nova) return;
  await db.transaction(async (tx) => {
    for (const [i, id] of nova.entries()) await tx.update(linhasDre).set({ ordem: (i + 1) * 10 }).where(eq(linhasDre.id, id));
  });
  revalidarTudo();
}

/** Só apaga linha sem categoria — categoria sem linha sumiria da DRE. */
export async function excluirLinhaAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  const [uso] = await db.select({ n: sql<number>`count(*)::int` }).from(categorias).where(eq(categorias.linhaId, id));
  if ((uso?.n ?? 0) > 0) return;
  await db.delete(linhasDre).where(eq(linhasDre.id, id));
  revalidarTudo();
}

// ── Categorias ─────────────────────────────────────────────────────────────

const categoriaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria.").max(80, "Nome muito longo."),
  linhaId: uuid,
  centroCustoId: uuid.nullable(),
  ativa: z.boolean(),
});

/** Cria (id null) ou edita uma categoria: nome, linha da DRE, centro padrão e se está ativa. */
export async function salvarCategoriaAction(
  id: string | null,
  _prev: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (id && !uuid.safeParse(id).success) return { erro: "Categoria inválida." };

  const parsed = categoriaSchema.safeParse({
    nome: formData.get("nome") ?? "",
    linhaId: formData.get("linhaId"),
    centroCustoId: vazioParaNulo(formData.get("centroCustoId")),
    ativa: id ? formData.get("ativa") === "on" : true,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const [linha] = await db.select({ tipo: linhasDre.tipo }).from(linhasDre).where(eq(linhasDre.id, parsed.data.linhaId)).limit(1);
  if (linha?.tipo !== "grupo") return { erro: "Categoria só entra em linha de grupo (subtotal é calculado)." };

  const antes = id
    ? (await db.select({ centroCustoId: categorias.centroCustoId }).from(categorias).where(eq(categorias.id, id)).limit(1))[0]
    : undefined;

  try {
    if (id) {
      await db.update(categorias).set(parsed.data).where(eq(categorias.id, id));
    } else {
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${categorias.ordem}), 0)::int` })
        .from(categorias)
        .where(eq(categorias.linhaId, parsed.data.linhaId));
      await db.insert(categorias).values({ ...parsed.data, ordem: max + 10 });
    }
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe uma categoria com esse nome." };
    throw err;
  }

  // O centro padrão vai para os lançamentos da categoria que não têm exceção.
  if (antes && antes.centroCustoId !== parsed.data.centroCustoId) await aplicarRegras();
  revalidarTudo();
  return { ok: id ? "Categoria salva." : "Categoria criada." };
}

export async function moverCategoriaAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const m = movimento.safeParse({ id: formData.get("id"), direcao: formData.get("direcao") });
  if (!m.success) return;
  const [cat] = await db.select({ linhaId: categorias.linhaId }).from(categorias).where(eq(categorias.id, m.data.id)).limit(1);
  if (!cat) return;
  const daLinha = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(eq(categorias.linhaId, cat.linhaId))
    .orderBy(asc(categorias.ordem), asc(categorias.nome));
  const nova = reordenar(
    daLinha.map((c) => c.id),
    m.data.id,
    m.data.direcao
  );
  if (!nova) return;
  await db.transaction(async (tx) => {
    for (const [i, id] of nova.entries()) await tx.update(categorias).set({ ordem: (i + 1) * 10 }).where(eq(categorias.id, id));
  });
  revalidarTudo();
}

// ── Centros de custo ───────────────────────────────────────────────────────

const centroSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do centro de custo.").max(60, "Nome muito longo."),
  ativo: z.boolean(),
});

export async function salvarCentroAction(id: string | null, _prev: ConfigFormState, formData: FormData): Promise<ConfigFormState> {
  if (!(await obterSessao())) return { erro: "Sessão expirada." };
  if (id && !uuid.safeParse(id).success) return { erro: "Centro inválido." };
  const parsed = centroSchema.safeParse({
    nome: formData.get("nome") ?? "",
    ativo: id ? formData.get("ativo") === "on" : true,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    if (id) {
      await db.update(centrosCusto).set(parsed.data).where(eq(centrosCusto.id, id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${centrosCusto.ordem}), 0)::int` }).from(centrosCusto);
      await db.insert(centrosCusto).values({ ...parsed.data, ordem: max + 10 });
    }
  } catch (err) {
    if (eViolacaoDeUnicidade(err)) return { erro: "Já existe um centro de custo com esse nome." };
    throw err;
  }
  revalidarTudo();
  return { ok: id ? "Centro salvo." : "Centro criado." };
}

export async function moverCentroAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const m = movimento.safeParse({ id: formData.get("id"), direcao: formData.get("direcao") });
  if (!m.success) return;
  const centros = await db.select({ id: centrosCusto.id }).from(centrosCusto).orderBy(asc(centrosCusto.ordem), asc(centrosCusto.nome));
  const nova = reordenar(
    centros.map((c) => c.id),
    m.data.id,
    m.data.direcao
  );
  if (!nova) return;
  await db.transaction(async (tx) => {
    for (const [i, id] of nova.entries()) await tx.update(centrosCusto).set({ ordem: (i + 1) * 10 }).where(eq(centrosCusto.id, id));
  });
  revalidarTudo();
}

/**
 * Apagar um centro deixa sem centro as categorias, regras e lançamentos que
 * apontavam para ele (o banco faz isso sozinho) e recalcula o resto.
 */
export async function excluirCentroAction(formData: FormData) {
  if (!(await obterSessao())) return;
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return;
  await db.delete(centrosCusto).where(eq(centrosCusto.id, id));
  await aplicarRegras();
  revalidarTudo();
}
