/**
 * Sincroniza o extrato bancário fora do cron.
 *
 *   npm run pluggy:sync             → todos os bancos já conectados
 *   npm run pluggy:sync -- <itemId> → conecta (se for novo) e sincroniza só esse
 *
 * Usa o mesmo sync da tela e do cron; precisa de DATABASE_URL,
 * PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local.
 */
const { sincronizarConexao, sincronizarTodas } = await import("../src/lib/pluggy/sync");

const itemId = process.argv[2]?.trim();

const resultados = itemId
  ? [{ itemId, instituicao: null, resultado: await sincronizarConexao(itemId) }]
  : await sincronizarTodas();

if (resultados.length === 0) {
  console.log("Nenhum banco conectado. Rode com o ID do item: npm run pluggy:sync -- <itemId>");
}

let falhou = false;
for (const { itemId: id, instituicao, resultado: r } of resultados) {
  if (r.ok) {
    console.log(`✓ ${r.instituicao ?? instituicao ?? "Banco"} (${id}): ${r.contas} conta(s), ${r.movimentacoes} movimentação(ões)`);
  } else {
    falhou = true;
    console.error(`✗ ${instituicao ?? "Banco"} (${id}): ${r.erro}`);
  }
}

process.exit(falhou ? 1 : 0);
