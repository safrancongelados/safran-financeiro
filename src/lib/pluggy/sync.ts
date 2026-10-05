/**
 * Sincronização do extrato: lê da Pluggy e grava no banco.
 *
 * Idempotente — tudo é upsert pelo ID da Pluggy, então rodar duas vezes (cron
 * e botão ao mesmo tempo, por exemplo) não duplica nada.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conexoesBancarias, contasBancarias, movimentacoesBancarias } from "@/db/schema";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { buscarContas, buscarItem, buscarTransacoes, PluggyErro, type PluggyTransaction } from "./client";
import { aplicarRegras } from "@/lib/categorizacao";
import { planejarMovimentacoes } from "./movimentacoes";

/** Linhas por INSERT: longe do limite de parâmetros do Postgres. */
const LOTE = 500;

export type ResultadoSync =
  | { ok: true; instituicao: string | null; contas: number; movimentacoes: number }
  /** `status` é o HTTP da Pluggy, quando a falha veio de lá (404 = item não existe). */
  | { ok: false; erro: string; status?: number };

export async function sincronizarConexao(itemId: string): Promise<ResultadoSync> {
  const agora = new Date();

  try {
    // Busca o item antes de gravar: um ID errado digitado na tela não pode
    // virar uma conexão fantasma.
    const item = await buscarItem(itemId);
    const dadosConexao = {
      instituicao: item.connector?.name ?? null,
      status: item.status,
      dadosAtualizadosEm: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
    };

    const [conexao] = await db
      .insert(conexoesBancarias)
      .values({ providerItemId: itemId, ...dadosConexao })
      .onConflictDoUpdate({
        target: conexoesBancarias.providerItemId,
        set: { ...dadosConexao, updatedAt: agora },
      })
      .returning({ id: conexoesBancarias.id });

    const contasPluggy = await buscarContas(itemId);
    const contas =
      contasPluggy.length === 0
        ? []
        : await db
            .insert(contasBancarias)
            .values(
              contasPluggy.map((c) => ({
                conexaoId: conexao.id,
                providerAccountId: c.id,
                nome: c.marketingName || c.name,
                numero: c.number ?? null,
                tipo: c.type,
                subtipo: c.subtype ?? null,
                saldoCentavos: reaisParaCentavos(c.balance),
              }))
            )
            .onConflictDoUpdate({
              target: contasBancarias.providerAccountId,
              set: {
                nome: sql`excluded.nome`,
                numero: sql`excluded.numero`,
                tipo: sql`excluded.tipo`,
                subtipo: sql`excluded.subtipo`,
                saldoCentavos: sql`excluded.saldo_centavos`,
                updatedAt: agora,
              },
            })
            .returning({
              id: contasBancarias.id,
              providerAccountId: contasBancarias.providerAccountId,
              tipo: contasBancarias.tipo,
            });

    // Contas em paralelo: cada uma é independente, e é o que faz o sync
    // caber no tempo de uma função serverless.
    const gravadasPorConta = await Promise.all(
      contas.map(async (conta) => {
        const transacoes = await buscarTransacoes(conta.providerAccountId);
        const brutoPorId = new Map<string, PluggyTransaction>(transacoes.map((tx) => [tx.id, tx]));
        // Um ID repetido no mesmo INSERT derruba o upsert inteiro no Postgres
        // ("cannot affect row a second time"); fica a última versão.
        const unicas = new Map(planejarMovimentacoes(transacoes, conta.tipo).map((m) => [m.providerTransactionId, m]));
        const linhas = [...unicas.values()].map((m) => ({
          ...m,
          contaId: conta.id,
          payloadBruto: brutoPorId.get(m.providerTransactionId),
        }));

        for (let i = 0; i < linhas.length; i += LOTE) {
          await db
            .insert(movimentacoesBancarias)
            .values(linhas.slice(i, i + LOTE))
            .onConflictDoUpdate({
              target: movimentacoesBancarias.providerTransactionId,
              set: {
                data: sql`excluded.data`,
                descricao: sql`excluded.descricao`,
                valorCentavos: sql`excluded.valor_centavos`,
                tipo: sql`excluded.tipo`,
                meio: sql`excluded.meio`,
                contraparte: sql`excluded.contraparte`,
                contraparteDocumento: sql`excluded.contraparte_documento`,
                categoriaPluggy: sql`excluded.categoria_pluggy`,
                payloadBruto: sql`excluded.payload_bruto`,
                updatedAt: agora,
              },
            });
        }
        return linhas.length;
      })
    );

    const movimentacoes = gravadasPorConta.reduce((acc, n) => acc + n, 0);
    // Movimentação nova já chega categorizada quando alguma regra casa.
    await aplicarRegras();
    await db
      .update(conexoesBancarias)
      .set({
        ultimoSyncEm: agora,
        ultimoSyncOk: true,
        ultimoSyncDetalhe: `${contas.length} conta(s), ${movimentacoes} movimentação(ões)`,
        updatedAt: agora,
      })
      .where(eq(conexoesBancarias.id, conexao.id));

    return { ok: true, instituicao: dadosConexao.instituicao, contas: contas.length, movimentacoes };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    // Só marca o erro se a conexão já existe; um ID novo que falhou não é gravado.
    await db
      .update(conexoesBancarias)
      .set({ ultimoSyncEm: agora, ultimoSyncOk: false, ultimoSyncDetalhe: erro, updatedAt: agora })
      .where(eq(conexoesBancarias.providerItemId, itemId))
      .catch(() => {});
    return { ok: false, erro, status: err instanceof PluggyErro ? err.status : undefined };
  }
}

export async function sincronizarTodas() {
  const conexoes = await db
    .select({ itemId: conexoesBancarias.providerItemId, instituicao: conexoesBancarias.instituicao })
    .from(conexoesBancarias);

  return Promise.all(
    conexoes.map(async (c) => ({ ...c, resultado: await sincronizarConexao(c.itemId) }))
  );
}

/**
 * O banco apagou ou estornou lançamentos (evento transactions/deleted). O
 * upsert nunca apaga nada, então sem isto o extrato guardaria para sempre uma
 * linha que o banco já não tem.
 */
export async function removerMovimentacoes(transactionIds: string[]): Promise<number> {
  if (transactionIds.length === 0) return 0;
  const removidas = await db
    .delete(movimentacoesBancarias)
    .where(inArray(movimentacoesBancarias.providerTransactionId, transactionIds))
    .returning({ id: movimentacoesBancarias.id });
  return removidas.length;
}

/**
 * Conexão apagada na Pluggy (evento item/deleted). O histórico fica: é
 * registro do caixa da empresa, e a DRE dos meses passados depende dele.
 */
export async function marcarConexaoRemovida(itemId: string): Promise<void> {
  await db
    .update(conexoesBancarias)
    .set({ status: "DELETED", updatedAt: new Date() })
    .where(eq(conexoesBancarias.providerItemId, itemId));
}
