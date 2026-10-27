import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { categorias, contasBancarias, movimentacoesBancarias } from "@/db/schema";
import { deslocarMes } from "@/lib/periodo";
import { preverRecorrencias, type Previsao } from "@/lib/recorrencias";

/** As saídas em conta dos últimos meses, para achar o que se repete. */
export async function previsoesDoMes(hoje: string, janelaMeses = 4): Promise<Previsao[]> {
  const mes = hoje.slice(0, 7);
  const inicio = `${deslocarMes(mes, -janelaMeses)}-01`;
  const fim = `${deslocarMes(mes, 1)}-01`;
  const saidas = await db
    .select({
      id: movimentacoesBancarias.id,
      data: movimentacoesBancarias.data,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      categoriaId: movimentacoesBancarias.categoriaId,
      categoriaNome: categorias.nome,
    })
    .from(movimentacoesBancarias)
    .innerJoin(contasBancarias, eq(movimentacoesBancarias.contaId, contasBancarias.id))
    .leftJoin(categorias, eq(movimentacoesBancarias.categoriaId, categorias.id))
    .where(and(eq(contasBancarias.tipo, "BANK"), lt(movimentacoesBancarias.valorCentavos, 0), gte(movimentacoesBancarias.data, inicio), lt(movimentacoesBancarias.data, fim)));
  return preverRecorrencias(saidas, hoje, janelaMeses);
}
