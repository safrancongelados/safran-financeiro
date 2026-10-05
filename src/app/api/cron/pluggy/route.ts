import { NextResponse } from "next/server";
import { sincronizarTodas } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync diário do extrato, chamado pelo Vercel Cron (ver vercel.json).
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>` sozinha quando a
 * variável existe no projeto. Sem a variável, a rota recusa: esta URL é
 * pública e não deve disparar chamadas à Pluggy para quem a descobrir.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const resultados = await sincronizarTodas();
  const falhou = resultados.some((r) => !r.resultado.ok);
  // 500 quando algum banco falhou, para o erro aparecer no painel de crons.
  return NextResponse.json({ resultados }, { status: falhou ? 500 : 200 });
}
