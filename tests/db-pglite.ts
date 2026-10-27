/** Substitui "@/db" nos testes: um Postgres em processo (PGlite) com as migrations aplicadas. Aguarde `pronto` antes da primeira query. */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";

const RAIZ = new URL("../drizzle", import.meta.url).pathname;
export const pglite = new PGlite();
export const db = drizzle(pglite, { schema });
export const pronto = (async () => {
  const journal = JSON.parse(readFileSync(`${RAIZ}/meta/_journal.json`, "utf8"));
  for (const e of journal.entries) {
    const comandos = readFileSync(`${RAIZ}/${e.tag}.sql`, "utf8").split("--> statement-breakpoint").map((s: string) => s.trim()).filter(Boolean);
    for (const c of comandos) {
      try {
        await pglite.exec(c);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists|duplicate/i.test(msg)) throw new Error(`${e.tag}: ${msg}\n${c.slice(0, 200)}`);
      }
    }
  }
})();
