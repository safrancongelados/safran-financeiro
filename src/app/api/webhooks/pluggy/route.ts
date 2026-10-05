import { after, NextResponse } from "next/server";
import { z } from "zod";
import { marcarConexaoRemovida, removerMovimentacoes, sincronizarConexao } from "@/lib/pluggy/sync";

export const dynamic = "force-dynamic";
// O sync roda depois da resposta (after), dentro deste limite.
export const maxDuration = 60;

const eventoSchema = z.object({
  event: z.string(),
  itemId: z.string().optional(),
  transactionIds: z.array(z.string()).optional(),
});

/** Eventos que significam "tem dado novo ou status novo neste item". */
const RESSINCRONIZA = new Set([
  "item/created",
  "item/updated",
  "item/login_succeeded",
  "item/error",
  "item/waiting_user_input",
  "item/waiting_user_action",
  "transactions/created",
  "transactions/updated",
]);

/**
 * Avisos da Pluggy sobre as conexões da Safran.
 *
 * A Pluggy exige resposta 2xx em até 5 s, então o trabalho pesado vai para
 * `after`. A autenticação é um segredo na query string, colocado na URL que o
 * próprio sistema entrega à Pluggy ao gerar o token de conexão. Tudo aqui é
 * idempotente: a Pluggy reenvia eventos, e reprocessar não duplica nada.
 */
export async function POST(request: Request) {
  const segredo = process.env.PLUGGY_WEBHOOK_SECRET;
  if (!segredo || new URL(request.url).searchParams.get("segredo") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const parsed = eventoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });

  const { event, itemId, transactionIds } = parsed.data;

  if (event === "transactions/deleted" && transactionIds) {
    after(() => removerMovimentacoes(transactionIds));
  } else if (event === "item/deleted" && itemId) {
    after(() => marcarConexaoRemovida(itemId));
  } else if (RESSINCRONIZA.has(event) && itemId) {
    // Item de outra aplicação não passa: o sync consulta a Pluggy com as
    // credenciais da Safran, e um ID que não é dela volta 404 sem gravar nada.
    after(() => sincronizarConexao(itemId));
  }

  // Evento desconhecido também recebe 200, para a Pluggy não ficar reenviando.
  return NextResponse.json({ recebido: true });
}
