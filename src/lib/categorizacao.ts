/**
 * Aplica as regras de categorização no banco. A decisão em si mora em
 * `lib/regras.ts`; aqui só se lê, decide e grava em lote.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { categorias, movimentacoesBancarias, regrasCategorizacao } from "@/db/schema";
import { codigoPostgres } from "./db-erros";
import { ordenarRegras, resolverRegras } from "./regras";

const LOTE = 1000;

function agrupar<K>(mapa: Map<string, { chave: K; ids: string[] }>, chave: K, id: string) {
  const k = JSON.stringify(chave);
  const grupo = mapa.get(k) ?? { chave, ids: [] };
  grupo.ids.push(id);
  mapa.set(k, grupo);
}

/**
 * Recalcula, para toda movimentação:
 * - a categoria, nas que não foram categorizadas à mão;
 * - o nome de exibição e o centro de custo, em todas — o centro vem da
 *   exceção de uma regra ou, sem exceção, do padrão da categoria.
 *
 * Roda depois de cada sync, no build e sempre que uma regra, categoria ou
 * centro muda, então uma mudança vale também para o passado.
 *
 * Devolve quantas linhas mudaram de categoria.
 */
export async function aplicarRegras(): Promise<number> {
  const [regras, cats] = await Promise.all([
    db.select().from(regrasCategorizacao),
    db.select({ id: categorias.id, centroCustoId: categorias.centroCustoId }).from(categorias),
  ]);
  const ordenadas = ordenarRegras(regras);
  const centroPadrao = new Map(cats.map((c) => [c.id, c.centroCustoId]));

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
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      centroCustoId: movimentacoesBancarias.centroCustoId,
    })
    .from(movimentacoesBancarias);

  // Agrupa por destino para gravar com um UPDATE por grupo, não por linha.
  const porCategoria = new Map<string, { chave: string | null; ids: string[] }>();
  const porDetalhe = new Map<string, { chave: [string | null, string | null, string | null]; ids: string[] }>();
  for (const mov of movimentacoes) {
    const r = resolverRegras(mov, ordenadas);
    // Categoria escolhida à mão fica; nome e centro continuam vindo das regras.
    const manual = mov.categorizadaPor === "manual";
    const categoriaId = manual ? mov.categoriaId : (r.categoria?.categoriaId ?? null);
    const regraId = manual ? null : (r.categoria?.id ?? null);
    const nome = r.nome?.nomeExibicao ?? null;
    const centro = r.centro?.centroCustoId ?? (categoriaId ? (centroPadrao.get(categoriaId) ?? null) : null);

    if (!manual && categoriaId !== mov.categoriaId) agrupar(porCategoria, categoriaId, mov.id);
    if (regraId !== mov.regraId || nome !== mov.nomeExibicao || centro !== mov.centroCustoId) {
      agrupar(porDetalhe, [regraId, nome, centro], mov.id);
    }
  }

  for (const { chave: [regraId, nomeExibicao, centroCustoId], ids } of porDetalhe.values()) {
    for (let i = 0; i < ids.length; i += LOTE) {
      try {
        await db
          .update(movimentacoesBancarias)
          .set({ regraId, nomeExibicao, centroCustoId })
          .where(inArray(movimentacoesBancarias.id, ids.slice(i, i + LOTE)));
      } catch (err) {
        // A regra ou o centro foi apagado enquanto isto rodava; quem apagou roda de novo.
        if (codigoPostgres(err) !== "23503") throw err;
      }
    }
  }

  let alteradas = 0;
  for (const { chave: categoriaId, ids } of porCategoria.values()) {
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
