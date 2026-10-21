/**
 * Sincroniza os pedidos do Cardápio Web fora do cron.
 *
 *   npm run cardapio-web:sync
 *
 * Cada rodada detalha até 150 pedidos; com histórico grande, rode até o
 * resultado dizer que não falta nenhum. Precisa de DATABASE_URL,
 * CARDAPIO_WEB_API_URL, CARDAPIO_WEB_TOKEN e CARDAPIO_WEB_MERCHANT_UUID no
 * .env.local.
 */
const { sincronizarPedidos } = await import("../src/lib/cardapio-web/sync");

const r = await sincronizarPedidos();
if (r.ok) {
  console.log(
    `✓ ${r.loja ?? "Loja"}: ${r.gravados} pedido(s) gravado(s)` +
      (r.pendentes > 0 ? `, faltam ${r.pendentes} (rode de novo)` : "") +
      (r.cobertoDesde ? ` · histórico coberto desde ${r.cobertoDesde}` : "")
  );
  process.exit(0);
} else {
  console.error(`✗ ${r.erro}`);
  process.exit(1);
}
