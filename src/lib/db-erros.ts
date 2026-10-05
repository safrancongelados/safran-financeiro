/** Violação de unicidade no Postgres. */
export const UNIQUE_VIOLATION = "23505";

/**
 * O Drizzle embrulha o erro do driver numa própria, então o código do Postgres
 * fica em `cause` e não na raiz. Ler só `err.code` faz o tratamento de
 * duplicidade passar batido e virar erro 500 na cara do usuário.
 */
export function codigoPostgres(err: unknown): string | undefined {
  const direto = (err as { code?: unknown })?.code;
  if (typeof direto === "string") return direto;
  const causa = (err as { cause?: { code?: unknown } })?.cause;
  return typeof causa?.code === "string" ? causa.code : undefined;
}

export function eViolacaoDeUnicidade(err: unknown): boolean {
  return codigoPostgres(err) === UNIQUE_VIOLATION;
}
