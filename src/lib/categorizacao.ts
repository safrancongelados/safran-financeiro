/**
 * Aplica as regras de categorização no banco. A decisão em si mora em
 * `lib/regras.ts`; aqui só se lê, decide e grava em lote.
 */
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { movimentacoesBancarias, regrasCategorizacao } from "@/db/schema";
import { escolherRegra, ordenarRegras } from "./regras";

/**
 * Recalcula a categoria de toda movimentação que não foi categorizada à mão.
 * Roda depois de cada sync e sempre que uma regra nasce ou é apagada, então
 * uma regra nova vale também para o passado.
 *
 * Devolve quantas linhas mudaram.
 */
export async function aplicarRegras(): Promise<number> {
  const regras = ordenarRegras(await db.select().from(regrasCategorizacao));

  const candidatas = await db
    .select({
      id: movimentacoesBancarias.id,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      categoriaId: movimentacoesBancarias.categoriaId,
    })
    .from(movimentacoesBancarias)
    .where(
      or(isNull(movimentacoesBancarias.categorizadaPor), ne(movimentacoesBancarias.categorizadaPor, "manual"))
    );

  // Agrupa por destino para gravar com um UPDATE por categoria, não por linha.
  const porDestino = new Map<string | null, string[]>();
  for (const mov of candidatas) {
    const destino = escolherRegra(mov, regras)?.categoriaId ?? null;
    if (destino === mov.categoriaId) continue;
    const ids = porDestino.get(destino) ?? [];
    ids.push(mov.id);
    porDestino.set(destino, ids);
  }

  let alteradas = 0;
  for (const [categoriaId, ids] of porDestino) {
    for (let i = 0; i < ids.length; i += 1000) {
      const lote = ids.slice(i, i + 1000);
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
