import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A conexão só é criada no primeiro uso real (primeira query), não na
// importação do módulo. Isso evita que o build do Next.js quebre ao
// coletar metadados das rotas dinâmicas, que importam este arquivo sem
// nunca chegar a executar uma query.
let instancia: NodePgDatabase<typeof schema> | undefined;

function obterInstancia(): NodePgDatabase<typeof schema> {
  if (!instancia) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL não configurada");
    }

    // Feito para a Vercel (Fluid compute) atrás do Transaction pooler da
    // Supabase (porta 6543):
    // - pool pequeno e conexão ociosa devolvida em segundos: o pooler da
    //   Supabase tem 15 conexões reais para todas as instâncias;
    // - attachDatabasePool mantém a instância viva até as ociosas fecharem.
    //   Sem isso, a instância é congelada com a conexão aberta, o pooler a
    //   derruba e a consulta seguinte espera para sempre — foi o que deixou
    //   a DRE presa 300 s;
    // - query_timeout: se ainda assim travar, a consulta falha em 20 s e a
    //   tela mostra o erro com "tentar de novo", em vez de girar até o limite.
    // O pg não usa prepared statement nomeado, então funciona no
    // Transaction pooler sem configuração extra.
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      query_timeout: 20_000,
      keepAlive: true,
    });
    // O pooler derruba conexão ociosa; sem ouvinte, o "error" do pool vira
    // exceção não tratada e derruba a função inteira.
    pool.on("error", (err) => console.error("[db] conexão ociosa caiu:", err.message));
    attachDatabasePool(pool);
    instancia = drizzle(pool, { schema });
  }
  return instancia;
}

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(obterInstancia(), prop, receiver);
  },
});
