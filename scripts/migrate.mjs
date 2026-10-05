/**
 * Aplica as migrations pendentes antes do build.
 *
 * Roda no deploy, e não à mão: foi exatamente o passo manual que deixou a
 * produção cinco migrations atrás do código e derrubou o site. Se falhar, o
 * deploy falha — melhor não publicar do que publicar código que não conversa
 * com o próprio banco.
 *
 * Não usa `drizzle-kit migrate`, que trava indefinidamente contra este
 * Postgres; executa o SQL gerado direto.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = join(RAIZ, "drizzle");

/** Trava de sessão: dois deploys simultâneos não aplicam a mesma migration. */
const CHAVE_TRAVA = 4713027;

/**
 * Erros de "já existe".
 *
 * O banco de produção foi criado antes desta tabela de controle, então as
 * primeiras migrations já estão aplicadas nele sem registro. Em vez de
 * adivinhar quais, cada comando roda num savepoint e um objeto que já existe é
 * apenas ignorado — o resultado final é o mesmo e o script serve tanto para
 * banco novo quanto para o que já estava rodando.
 */
const JA_EXISTE = new Set([
  "42P07", // tabela ou índice duplicado
  "42701", // coluna duplicada
  "42710", // objeto duplicado (tipo, constraint)
  "42P06", // schema duplicado
  "23505", // violação de unicidade num INSERT de seed
]);

function codigoDoErro(err) {
  return err?.code ?? err?.cause?.code;
}

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

async function aplicarMigration(sql, entrada) {
  const comandos = readFileSync(join(PASTA, `${entrada.tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  let aplicados = 0;
  let ignorados = 0;

  // A migration inteira numa transação; cada comando num savepoint, para que um
  // "já existe" tolerado não aborte os comandos seguintes.
  await sql.begin(async (tx) => {
    for (const comando of comandos) {
      try {
        await tx.savepoint(async (sp) => {
          await sp.unsafe(comando);
        });
        aplicados++;
      } catch (err) {
        if (!JA_EXISTE.has(codigoDoErro(err))) throw err;
        ignorados++;
      }
    }
    await tx`insert into "_migracoes" ("tag") values (${entrada.tag})`;
  });

  return { aplicados, ignorados, total: comandos.length };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Num deploy de produção, banco ausente é falha: sair em silêncio aqui
    // publicaria de novo código sem o schema, que é o problema que este script
    // existe para impedir. Fora dele (checagem de tipos num CI), só ignora.
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("DATABASE_URL não está disponível no build de produção — migrations não foram aplicadas.");
    }
    log("DATABASE_URL ausente — nada a fazer.");
    return;
  }

  const journal = JSON.parse(readFileSync(join(PASTA, "meta", "_journal.json"), "utf8"));
  const entradas = [...journal.entries].sort((a, b) => a.idx - b.idx);

  // onnotice silenciado: "already exists, skipping" é esperado aqui e só poluiria o log do deploy.
  const sql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 30, onnotice: () => {} });

  try {
    await sql`select pg_advisory_lock(${CHAVE_TRAVA})`;

    await sql`
      create table if not exists "_migracoes" (
        "tag" text primary key,
        "aplicada_em" timestamptz not null default now()
      )
    `;

    const jaAplicadas = new Set((await sql`select tag from "_migracoes"`).map((l) => l.tag));
    const pendentes = entradas.filter((e) => !jaAplicadas.has(e.tag));

    if (pendentes.length === 0) {
      log(`nada pendente (${entradas.length} já registradas).`);
      return;
    }

    log(`${pendentes.length} pendente(s): ${pendentes.map((p) => p.tag).join(", ")}`);

    for (const entrada of pendentes) {
      const r = await aplicarMigration(sql, entrada);
      log(
        `${entrada.tag}: ${r.aplicados}/${r.total} aplicado(s)` +
          (r.ignorados > 0 ? `, ${r.ignorados} já existia(m)` : "")
      );
    }

    log("migrations em dia.");
  } finally {
    await sql`select pg_advisory_unlock(${CHAVE_TRAVA})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate] FALHOU:", err?.message ?? err);
  if (err?.cause) console.error("[migrate] causa:", err.cause.message ?? err.cause);
  process.exit(1);
});
