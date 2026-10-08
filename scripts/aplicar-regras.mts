/**
 * Roda as regras de categorização sobre todo o extrato. Vai no build, logo
 * depois das migrations: regra que chega por migration (ou mudança no jeito
 * de aplicar) já vale quando o deploy termina, sem esperar o sync nem o
 * botão "Aplicar regras agora".
 *
 * Falha aqui não derruba o deploy: o extrato continua como estava e o botão
 * em /regras resolve depois.
 */
if (!process.env.DATABASE_URL) {
  console.log("[regras] DATABASE_URL não configurada — pulado.");
  process.exit(0);
}

try {
  const { aplicarRegras } = await import("../src/lib/categorizacao");
  const alteradas = await aplicarRegras();
  console.log(`[regras] ${alteradas} movimentação(ões) categorizada(s) ou recategorizada(s).`);
} catch (err) {
  console.error("[regras] FALHOU (o deploy segue; use Aplicar regras agora em /regras):", err instanceof Error ? err.message : err);
}
process.exit(0);
