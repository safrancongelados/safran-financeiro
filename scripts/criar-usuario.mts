/**
 * Cria (ou redefine a senha de) um acesso ao sistema.
 *
 *   npm run usuario:criar -- email@dominio.com "Nome"
 *
 * Gera uma senha provisória e mostra uma vez só; a pessoa troca em /senha.
 */
import { randomBytes } from "node:crypto";

const { db } = await import("../src/db/index");
const { usuarios } = await import("../src/db/schema");
const { hashPassword } = await import("../src/lib/auth");

const [emailBruto, nome] = process.argv.slice(2);
const email = emailBruto?.trim().toLowerCase();
if (!email || !email.includes("@") || !nome) {
  console.error('Uso: npm run usuario:criar -- email@dominio.com "Nome"');
  process.exit(1);
}

// Sem caracteres ambíguos (0/O, 1/l) para ditar por telefone sem erro.
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const senha = Array.from(randomBytes(12), (b) => ALFABETO[b % ALFABETO.length]).join("");

const senhaHash = await hashPassword(senha);
await db
  .insert(usuarios)
  .values({ email, nome, senhaHash })
  .onConflictDoUpdate({ target: usuarios.email, set: { nome, senhaHash } });

console.log(`Acesso pronto para ${nome} <${email}>`);
console.log(`Senha provisória: ${senha}`);
process.exit(0);
