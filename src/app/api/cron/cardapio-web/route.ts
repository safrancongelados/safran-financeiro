import { NextResponse } from "next/server";
import { sincronizarPedidos } from "@/lib/cardapio-web/sync";

export const dynamic = "force-dynamic";
// Uma rodada detalha até 150 pedidos, seis por vez.
export const maxDuration = 300;

/**
 * Sync diário dos pedidos do Cardápio Web, chamado pelo Vercel Cron (ver
 * vercel.json), meia hora depois do extrato. Mesma proteção do cron da
 * Pluggy: a Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const resultado = await sincronizarPedidos();
  // 500 quando falhou, para o erro aparecer no painel de crons.
  return NextResponse.json({ resultado }, { status: resultado.ok ? 200 : 500 });
}
