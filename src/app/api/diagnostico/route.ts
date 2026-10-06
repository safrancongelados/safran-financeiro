import { NextResponse } from "next/server";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { buscarContas, buscarItem, PluggyErro } from "@/lib/pluggy/client";
import {
  categorias,
  conexoesBancarias,
  contasBancarias,
  movimentacoesBancarias,
  regrasCategorizacao,
  usuarios,
} from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Saúde do sistema para quem dá suporte: banco responde? o banco da Safran
 * está conectado e sincronizando? quanto do extrato já tem categoria?
 *
 * Protegido pelo CRON_SECRET (na query, `?segredo=`, para dar para abrir no
 * navegador). Só devolve contagens e status — nenhum valor em reais, nome de
 * cliente ou dado da conta.
 *
 * Com `&item=<id>`, pergunta também à Pluggy se as credenciais da Safran
 * enxergam aquela conexão (só leitura, nada é gravado). Serve para saber se
 * uma conexão do Meu Pluggy já foi liberada para a aplicação.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function testarItemNaPluggy(itemId: string) {
  try {
    const item = await buscarItem(itemId);
    const contas = await buscarContas(itemId);
    return {
      enxerga: true,
      instituicao: item.connector?.name ?? null,
      status: item.status,
      atualizadoEm: item.lastUpdatedAt ?? null,
      contas: contas.map((c) => ({ tipo: c.type, subtipo: c.subtype ?? null })),
    };
  } catch (err) {
    return {
      enxerga: false,
      status: err instanceof PluggyErro ? err.status : null,
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || new URL(request.url).searchParams.get("segredo") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const itemParam = new URL(request.url).searchParams.get("item");
  const pluggy = itemParam && UUID.test(itemParam) ? await testarItemNaPluggy(itemParam.toLowerCase()) : undefined;

  const inicio = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latenciaMs = Date.now() - inicio;

    const [conexoes, contas, porMes, [totais], [contagens]] = await Promise.all([
      db
        .select({
          instituicao: conexoesBancarias.instituicao,
          status: conexoesBancarias.status,
          dadosAtualizadosEm: conexoesBancarias.dadosAtualizadosEm,
          ultimoSyncEm: conexoesBancarias.ultimoSyncEm,
          ultimoSyncOk: conexoesBancarias.ultimoSyncOk,
          ultimoSyncDetalhe: conexoesBancarias.ultimoSyncDetalhe,
          criadaEm: conexoesBancarias.createdAt,
        })
        .from(conexoesBancarias)
        .orderBy(asc(conexoesBancarias.createdAt)),
      db
        .select({ nome: contasBancarias.nome, tipo: contasBancarias.tipo, subtipo: contasBancarias.subtipo })
        .from(contasBancarias),
      db
        .select({
          mes: sql<string>`to_char(${movimentacoesBancarias.data}, 'YYYY-MM')`,
          quantidade: sql<number>`count(*)::int`,
          semCategoria: sql<number>`count(*) filter (where ${movimentacoesBancarias.categoriaId} is null)::int`,
        })
        .from(movimentacoesBancarias)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db
        .select({
          total: sql<number>`count(*)::int`,
          semCategoria: sql<number>`count(*) filter (where ${movimentacoesBancarias.categoriaId} is null)::int`,
          porRegra: sql<number>`count(*) filter (where ${movimentacoesBancarias.categorizadaPor} = 'regra')::int`,
          manual: sql<number>`count(*) filter (where ${movimentacoesBancarias.categorizadaPor} = 'manual')::int`,
          primeiraData: sql<string | null>`min(${movimentacoesBancarias.data})::text`,
          ultimaData: sql<string | null>`max(${movimentacoesBancarias.data})::text`,
        })
        .from(movimentacoesBancarias),
      db
        .select({
          usuarios: sql<number>`(select count(*)::int from ${usuarios})`,
          categorias: sql<number>`(select count(*)::int from ${categorias})`,
          regras: sql<number>`(select count(*)::int from ${regrasCategorizacao})`,
        })
        .from(sql`(select 1) as um`),
    ]);

    return NextResponse.json({
      ...(pluggy ? { pluggy } : {}),
      banco: { ok: true, latenciaMs },
      conexoes,
      contas,
      movimentacoes: { ...totais, porMes },
      ...contagens,
    });
  } catch (err) {
    console.error("[diagnostico]", err);
    const causa = (err as { cause?: { message?: string } })?.cause?.message;
    return NextResponse.json(
      {
        ...(pluggy ? { pluggy } : {}),
        banco: { ok: false, latenciaMs: Date.now() - inicio, erro: causa ?? (err instanceof Error ? err.message : String(err)) },
      },
      { status: 500 }
    );
  }
}
