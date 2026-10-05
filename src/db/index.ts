import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// A conexão só é criada no primeiro uso real (primeira query), não na
// importação do módulo. Isso evita que o build do Next.js quebre ao
// coletar metadados das rotas dinâmicas, que importam este arquivo sem
// nunca chegar a executar uma query.
let instancia: PostgresJsDatabase<typeof schema> | undefined;

function obterInstancia(): PostgresJsDatabase<typeof schema> {
  if (!instancia) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL não configurada");
    }
    // Feito para função serverless atrás do pooler da Supabase:
    // - prepare: false — o Transaction pooler (porta 6543) troca a conexão
    //   real a cada transação, e prepared statement não sobrevive à troca;
    // - max baixo e idle_timeout — cada instância da função segura poucas
    //   conexões e devolve as ociosas. Sem isso, o Session pooler esgotou o
    //   limite de 15 clientes no primeiro acesso (EMAXCONNSESSION).
    const client = postgres(connectionString, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
    });
    instancia = drizzle(client, { schema });
  }
  return instancia;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(obterInstancia(), prop, receiver);
  },
});
