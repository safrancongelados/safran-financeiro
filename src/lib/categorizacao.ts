/**
 * Aplica as regras de categorização no banco. A decisão em si mora em
 * `lib/regras.ts` (regras), `lib/pessoas.ts` (quem é quem) e
 * `lib/estornos.ts` (pareamento de estornos); aqui só se lê, decide e grava
 * em lote.
 */
import { and, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { categorias, movimentacoesBancarias, pessoas, regrasCategorizacao } from "@/db/schema";
import { codigoPostgres } from "./db-erros";
import { parearEstornos } from "./estornos";
import { indexarPessoas, reconhecerPessoa } from "./pessoas";
import { ordenarRegras, resolverRegras } from "./regras";

const LOTE = 1000;

function agrupar<K>(mapa: Map<string, { chave: K; ids: string[] }>, chave: K, id: string) {
  const k = JSON.stringify(chave);
  const grupo = mapa.get(k) ?? { chave, ids: [] };
  grupo.ids.push(id);
  mapa.set(k, grupo);
}

type Origem = "regra" | "pessoa" | "estorno" | null;

/**
 * Recalcula, para toda movimentação:
 * - a pessoa, pelo cadastro (documento ou trecho do nome);
 * - a categoria, nas que não foram categorizadas à mão: pela regra que casa;
 *   sem regra, pela categoria padrão da pessoa; num estorno com a ida
 *   encontrada, a categoria da ida (ver `lib/estornos.ts`);
 * - o nome de exibição e o centro de custo, em todas — o centro vem da
 *   exceção de uma regra ou, sem exceção, do padrão da categoria.
 *
 * Roda depois de cada sync, no build e sempre que uma regra, categoria,
 * centro ou pessoa muda, então uma mudança vale também para o passado.
 *
 * Devolve quantas linhas mudaram de categoria.
 */
export async function aplicarRegras(): Promise<number> {
  const [regras, cats, cadastro] = await Promise.all([
    db.select().from(regrasCategorizacao),
    db.select({ id: categorias.id, centroCustoId: categorias.centroCustoId }).from(categorias),
    db
      .select({ id: pessoas.id, documento: pessoas.documento, padroes: pessoas.padroes, ativa: pessoas.ativa, categoriaId: pessoas.categoriaId })
      .from(pessoas),
  ]);
  const ordenadas = ordenarRegras(regras);
  const centroPadrao = new Map(cats.map((c) => [c.id, c.centroCustoId]));
  const indicePessoas = indexarPessoas(cadastro);

  const movimentacoes = await db
    .select({
      id: movimentacoesBancarias.id,
      contaId: movimentacoesBancarias.contaId,
      data: movimentacoesBancarias.data,
      valorCentavos: movimentacoesBancarias.valorCentavos,
      contraparte: movimentacoesBancarias.contraparte,
      contraparteDocumento: movimentacoesBancarias.contraparteDocumento,
      descricao: movimentacoesBancarias.descricao,
      categoriaId: movimentacoesBancarias.categoriaId,
      categorizadaPor: movimentacoesBancarias.categorizadaPor,
      regraId: movimentacoesBancarias.regraId,
      nomeExibicao: movimentacoesBancarias.nomeExibicao,
      centroCustoId: movimentacoesBancarias.centroCustoId,
      pessoaId: movimentacoesBancarias.pessoaId,
    })
    .from(movimentacoesBancarias);

  // Primeiro o que cada linha teria por conta própria (à mão, regra ou
  // pessoa): é o que a ida de um estorno passa adiante.
  const resolucoes = new Map(movimentacoes.map((mov) => [mov.id, resolverRegras(mov, ordenadas)]));
  const pessoaDe = new Map(movimentacoes.map((mov) => [mov.id, reconhecerPessoa(mov, indicePessoas)]));
  const propria = new Map<string, { categoriaId: string | null; origem: Origem; regraId: string | null }>();
  for (const mov of movimentacoes) {
    if (mov.categorizadaPor === "manual") {
      propria.set(mov.id, { categoriaId: mov.categoriaId, origem: null, regraId: null });
      continue;
    }
    const r = resolucoes.get(mov.id)!;
    if (r.categoria?.categoriaId) {
      propria.set(mov.id, { categoriaId: r.categoria.categoriaId, origem: "regra", regraId: r.categoria.id });
      continue;
    }
    const pessoa = pessoaDe.get(mov.id);
    if (pessoa?.categoriaId) {
      propria.set(mov.id, { categoriaId: pessoa.categoriaId, origem: "pessoa", regraId: null });
      continue;
    }
    propria.set(mov.id, { categoriaId: null, origem: null, regraId: null });
  }
  const pares = parearEstornos(movimentacoes);

  // Agrupa por destino para gravar com um UPDATE por grupo, não por linha.
  const porCategoria = new Map<string, { chave: [string | null, Origem]; ids: string[] }>();
  const porDetalhe = new Map<string, { chave: [string | null, string | null, string | null, string | null]; ids: string[] }>();
  for (const mov of movimentacoes) {
    const r = resolucoes.get(mov.id)!;
    const manual = mov.categorizadaPor === "manual";
    let { categoriaId, origem, regraId } = propria.get(mov.id)!;
    // Estorno com ida encontrada herda a categoria dela, sem regra no meio.
    // Ida sem categoria não ensina nada: vale o que as regras disserem.
    const ida = manual ? undefined : pares.get(mov.id);
    const daIda = ida ? propria.get(ida)?.categoriaId : null;
    if (daIda) {
      categoriaId = daIda;
      origem = "estorno";
      regraId = null;
    }
    const nome = r.nome?.nomeExibicao ?? null;
    const centro = r.centro?.centroCustoId ?? (categoriaId ? (centroPadrao.get(categoriaId) ?? null) : null);
    const pessoaId = pessoaDe.get(mov.id)?.id ?? null;

    if (!manual && (categoriaId !== mov.categoriaId || origem !== (mov.categorizadaPor ?? null))) {
      agrupar(porCategoria, [categoriaId, origem], mov.id);
    }
    if (regraId !== mov.regraId || nome !== mov.nomeExibicao || centro !== mov.centroCustoId || pessoaId !== mov.pessoaId) {
      agrupar(porDetalhe, [regraId, nome, centro, pessoaId], mov.id);
    }
  }

  for (const { chave: [regraId, nomeExibicao, centroCustoId, pessoaId], ids } of porDetalhe.values()) {
    for (let i = 0; i < ids.length; i += LOTE) {
      try {
        await db
          .update(movimentacoesBancarias)
          .set({ regraId, nomeExibicao, centroCustoId, pessoaId })
          .where(inArray(movimentacoesBancarias.id, ids.slice(i, i + LOTE)));
      } catch (err) {
        // A regra, o centro ou a pessoa foi apagada enquanto isto rodava; quem apagou roda de novo.
        if (codigoPostgres(err) !== "23503") throw err;
      }
    }
  }

  let alteradas = 0;
  for (const { chave: [categoriaId, origem], ids } of porCategoria.values()) {
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE);
      await db
        .update(movimentacoesBancarias)
        .set({ categoriaId, categorizadaPor: categoriaId ? origem : null, updatedAt: new Date() })
        .where(
          and(
            inArray(movimentacoesBancarias.id, lote),
            // Alguém pode ter categorizado à mão enquanto isto rodava.
            or(isNull(movimentacoesBancarias.categorizadaPor), ne(movimentacoesBancarias.categorizadaPor, "manual"))
          )
        );
      alteradas += lote.length;
    }
  }
  return alteradas;
}
