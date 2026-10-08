/**
 * Aplica as regras de categorização no banco. A decisão em si mora em
 * `lib/regras.ts`; aqui só se lê, decide e grava em lote.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { movimentacoesBancarias, regrasCategorizacao } from "@/db/schema";
import { codigoPostgres } from "./db-erros";
import { escolherRegra, ordenarRegras } from "./regras";

const LOTE = 1000;

function agrupar(mapa: Map<string | null, string[]>, chave: string | null, id: string) {
  const ids = mapa.get(chave) ?? [];
  ids.push(id);
  mapa.set(chave, ids);
}

/**
 * Recalcula, para toda movimentação, qual regra casa com ela (de onde vem o
 * nome de exibição) e, nas que não foram categorizadas à mão, a categoria.
 * Roda depois de cada sync e sempre que uma regra nasce, muda ou é apagada,
 * então uma regra nova vale também para o passado.
 *
 * Devolve quantas linhas mudaram de categoria.
 */
export async function aplicarRegras(): Promise<number> {
  const regras = ordenarRegras(await db.select().from(regrasCategorizacao));

  const movimentacoes = await db
    .select({
      id: movimentacoesBancarias.id,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      categoriaId: movimentacoesBancarias.categoriaId,
      categorizadaPor: movimentacoesBancarias.categorizadaPor,
      regraId: movimentacoesBancarias.regraId,
    })
    .from(movimentacoesBancarias);

  // Agrupa por destino para gravar com um UPDATE por grupo, não por linha.
  const porRegra = new Map<string | null, string[]>();
  const porCategoria = new Map<string | null, string[]>();
  for (const mov of movimentacoes) {
    const regra = escolherRegra(mov, regras);
    if ((regra?.id ?? null) !== mov.regraId) agrupar(porRegra, regra?.id ?? null, mov.id);
    // Categoria escolhida à mão fica; só o nome de exibição acompanha a regra.
    if (mov.categorizadaPor === "manual") continue;
    if ((regra?.categoriaId ?? null) !== mov.categoriaId) agrupar(porCategoria, regra?.categoriaId ?? null, mov.id);
  }

  for (const [regraId, ids] of porRegra) {
    for (let i = 0; i < ids.length; i += LOTE) {
      try {
        await db
          .update(movimentacoesBancarias)
          .set({ regraId })
          .where(inArray(movimentacoesBancarias.id, ids.slice(i, i + LOTE)));
      } catch (err) {
        // A regra foi apagada enquanto isto rodava; quem apagou roda de novo.
        if (codigoPostgres(err) !== "23503") throw err;
      }
    }
  }

  let alteradas = 0;
  for (const [categoriaId, ids] of porCategoria) {
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE);
      await db
        .update(movimentacoesBancarias)
        .set({ categoriaId, categorizadaPor: categoriaId ? "regra" : null, updatedAt: new Date() })
        .where(
          and(
            inArray(movimentacoesBancarias.id, lote),
            // Alguém pode ter categorizado à mão enquanto isto rodava.
            or(isNull(movimentacoesBancarias.categorizadaPor), eq(movimentacoesBancarias.categorizadaPor, "regra"))
          )
        );
      alteradas += lote.length;
    }
  }
  return alteradas;
}
