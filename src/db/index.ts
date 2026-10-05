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
    const client = postgres(connectionString);
    instancia = drizzle(client, { schema });
  }
  return instancia;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(obterInstancia(), prop, receiver);
  },
});
