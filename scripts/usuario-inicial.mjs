/**
 * Cria o primeiro acesso no deploy, a partir de USUARIO_INICIAL_EMAIL e
 * USUARIO_INICIAL_SENHA (e, opcional, USUARIO_INICIAL_NOME).
 *
 * Só cria se o e-mail ainda não existe: a senha trocada em /senha não é
 * desfeita pelo deploy seguinte. Depois do primeiro acesso, as variáveis
 * podem ser apagadas da Vercel. Novos acessos: `npm run usuario:criar`.
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

const email = process.env.USUARIO_INICIAL_EMAIL?.trim().toLowerCase();
const senha = process.env.USUARIO_INICIAL_SENHA;
const nome = process.env.USUARIO_INICIAL_NOME?.trim() || "Safran";
const url = process.env.DATABASE_URL;

if (!email || !senha || !url) {
  console.log("[usuario-inicial] variáveis ausentes — nada a fazer.");
  process.exit(0);
}
if (senha.length < 8) {
  console.error("[usuario-inicial] FALHOU: USUARIO_INICIAL_SENHA precisa de ao menos 8 caracteres.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 30, prepare: false, onnotice: () => {} });
try {
  const senhaHash = await bcrypt.hash(senha, 10);
  const criados = await sql`
    insert into usuarios (nome, email, senha_hash) values (${nome}, ${email}, ${senhaHash})
    on conflict (email) do nothing
    returning id
  `;
  console.log(
    criados.length > 0 ? `[usuario-inicial] acesso criado para ${email}.` : `[usuario-inicial] ${email} já existe — mantido.`
  );
} finally {
  await sql.end({ timeout: 5 });
}
