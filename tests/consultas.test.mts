/**
 * Roda todas as leituras do banco (extrato, pessoas, relatórios, revisão,
 * busca, alertas, recorrências) num Postgres em processo (PGlite) com as
 * migrations aplicadas e um ano de lançamentos de exemplo. Pega erro de SQL
 * que o TypeScript não vê — coluna ambígua, função que o Postgres não
 * aceita — antes do deploy.
 *
 *   npm test
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { sql } from "drizzle-orm";

// Os módulos do app são CJS sob o tsx; o banco real (src/db/index.ts) é
// trocado pelo PGlite na resolução do require, depois de o tsx se instalar.
const require = createRequire(import.meta.url);
const Module = require("node:module") as { _resolveFilename: (...a: unknown[]) => string };
const SHIM = new URL("./db-pglite.ts", import.meta.url).pathname;
const original = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, ...args: unknown[]) {
  const r = original.apply(this, args);
  return /\/src\/db\/index\.ts$/.test(r) ? SHIM : r;
};
const { db, pglite, pronto } = require(SHIM) as typeof import("./db-pglite");
await pronto;

const S = new URL("../src", import.meta.url).pathname;
const fin = await import(`${S}/db/queries/financeiro`);
const pes = await import(`${S}/db/queries/pessoas`);
const rel = await import(`${S}/db/queries/relatorios`);
const ale = await import(`${S}/db/queries/alertas`);
const rec = await import(`${S}/db/queries/recorrencias`);
const dados = await import(`${S}/lib/relatorios-dados`);
const cat = await import(`${S}/lib/categorizacao`);
const filtros = await import(`${S}/lib/extrato-filtros`);
const periodo = await import(`${S}/lib/periodo`);

const hoje = "2026-10-27";
// Semente: uma conexão, uma conta, pessoas e um ano de lançamentos variados.
await pglite.exec(`
  insert into conexoes_bancarias (id, provider_item_id, instituicao, status) values ('11111111-1111-1111-1111-111111111111', 'item', 'MeuPluggy', 'UPDATED');
  insert into contas_bancarias (id, conexao_id, provider_account_id, nome, tipo, saldo_centavos) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'acc', 'Conta', 'BANK', 78005);
  insert into usuarios (nome, email, senha_hash, papel) values ('Dono', 'dono@x.com', 'h', 'dono');
  insert into pessoas (nome, tipo, padroes, categoria_id, meta_mensal_centavos) values ('Maria Luisinha', 'funcionario', '{"maria luisinha"}', (select id from categorias where nome = 'Salários e encargos'), 150000);
`);
const linhas: string[] = [];
let n = 0;
const add = (data: string, valor: number, descricao: string, contraparte: string | null, doc: string | null) => {
  n++;
  linhas.push(`('22222222-2222-2222-2222-222222222222', 'tx${n}', '${data}', $$${descricao}$$, ${valor}, ${valor < 0 ? "'DEBIT'" : "'CREDIT'"}, ${contraparte ? `$$${contraparte}$$` : "null"}, ${doc ? `'${doc}'` : "null"})`);
};
for (let i = 0; i < 12; i++) {
  const mes = periodo.deslocarMes("2026-10", -i);
  add(`${mes}-05`, -250000, "Pix enviado Imobiliaria Centro", "Imobiliaria Centro", "12345678000199");
  add(`${mes}-20`, -81900, "Pagamento de conta SIMPLES NACIONAL", null, null);
  add(`${mes}-10`, -45000, "Pix enviado Maria Luisinha", "Maria Luisinha", null);
  add(`${mes}-11`, -45000, "Pix enviado Maria Luisinha", "Maria Luisinha", null);
  add(`${mes}-12`, -120000, "Pix enviado Glaucos Antonio Cavalcante Costa", null, null);
  add(`${mes}-15`, 500000, "Liberação de dinheiro", null, null);
  add(`${mes}-16`, 30000, "Pix recebido Cliente Feliz", "Cliente Feliz", "11122233344");
  add(`${mes}-17`, -5000, "Compra misteriosa", "Loja X", null);
  add(`${mes}-18`, -80000, "Pagamento com QR Pix ASSAI ATACADISTA", "Sendas", "06057223000171");
}
add("2026-07-21", -17831, "Pagamento de conta DARF - CÓDIGO DE  BARRA", null, null);
add("2026-07-21", 17831, "Reembolso de pagamento de conta ITAU UNIBANCO", null, null);
add("2026-10-15", -300000, "TED grande sem categoria", "Novo Fornecedor Ltda", "99988877000166");
await pglite.exec(`insert into movimentacoes_bancarias (conta_id, provider_transaction_id, data, descricao, valor_centavos, tipo, contraparte, contraparte_documento) values ${linhas.join(",\n")};`);

// Categorização completa (regras, pessoas, estornos).
const alteradas = await cat.aplicarRegras();
assert.ok(alteradas > 0, "aplicarRegras categorizou");
const [{ pessoa }] = (await pglite.query<{ pessoa: string }>(`select count(*)::int as pessoa from movimentacoes_bancarias where pessoa_id is not null`)).rows;
assert.ok(Number(pessoa) >= 24, `pessoas reconhecidas: ${pessoa}`);
const [{ origem }] = (await pglite.query<{ origem: string }>(`select string_agg(distinct categorizada_por::text, ',') as origem from movimentacoes_bancarias`)).rows;
console.log("origens:", origem);
assert.ok(origem.includes("estorno") && origem.includes("regra"));
const [{ maria }] = (await pglite.query<{ maria: string }>(`select c.nome as maria from movimentacoes_bancarias m join categorias c on c.id = m.categoria_id where m.descricao like '%Maria Luisinha%' limit 1`)).rows;
assert.equal(maria, "Salários e encargos", "categoria padrão da pessoa");

// Extrato
const ok = (m: string) => /^\d{4}-\d{2}$/.test(m);
for (const params of [
  { mes: "2026-10" },
  { periodo: "6m", q: "maria" },
  { de: "2026-01-10", ate: "2026-03-31", tipo: "saida", min: "100", max: "5000", origem: "regra" },
  { periodo: "12m", pessoa: "sem", visao: "nomes", ordem: "valor", dir: "asc" },
  { periodo: "ano", categoria: "sem", centro: "sem", conta: "22222222-2222-2222-2222-222222222222" },
]) {
  const f = filtros.lerFiltroExtrato(params as never, "2026-10", ok);
  const r = await fin.listarMovimentacoes(f, hoje);
  const { inicio, fim } = filtros.intervaloDoFiltro(f, hoje);
  const t = await fin.totaisDoIntervalo(inicio, fim);
  console.log("extrato", JSON.stringify(params), r.length, "linhas; totais", t.lancamentos);
}
assert.ok((await fin.mesesComMovimento()).length >= 12);
assert.equal((await fin.saldoAtualDasContas()).saldoCentavos, 78005);
await fin.contarSemCategoria();
await fin.listarMovimentacoesRecentes(5);

// Pessoas
const pessoas = await pes.listarPessoas("2025-11-01");
const mariaP = pessoas.find((p) => p.nome === "Maria Luisinha")!;
assert.ok(mariaP.lancamentos >= 24 && mariaP.totalCentavos < 0, "resumo da pessoa");
await pes.resumoMensalDaPessoa(mariaP.id, "2025-11-01", "2026-11-01");
await pes.porCategoriaDaPessoa(mariaP.id, "2025-11-01", "2026-11-01");
await pes.ultimosLancamentosDaPessoa(mariaP.id, 5);
await pes.listarPessoasAtivas();
await pes.listarVisoesSalvas();

// Relatórios
for (const p of [{ tipo: "meses", n: 6 }, { tipo: "ano", ano: 2026 }] as const) {
  const rp = await dados.relatorioPessoal(p, hoje);
  assert.ok(rp.cadastradas.some((l) => l.nome === "Maria Luisinha"), "pessoal: Maria");
  assert.ok(rp.cadastradas.find((l) => l.nome === "Maria Luisinha")!.acimaDaMeta === 0, "90.000 < meta 150.000");
  const rc = await dados.relatorioCustos(p, hoje);
  assert.ok(rc.linhas.length > 0 && rc.linhas[0].top.length > 0, "custos com top contrapartes");
  const rf = await dados.relatorioFornecedores(p, hoje);
  assert.ok(rf.linhas.some((l) => l.nome.includes("Imobiliaria")), "fornecedores");
  assert.ok(!rf.linhas.some((l) => l.nome.includes("Maria")), "funcionária não é fornecedora");
  const ri = await dados.relatorioImpostos(p, hoje);
  assert.ok(ri.linhas.some((l) => /simples/i.test(l.nome)) && ri.aliquota !== null, "impostos com alíquota");
  console.log("relatórios", JSON.stringify(p), "pessoal", rp.cadastradas.length, "custos", rc.linhas.length, "forn", rf.linhas.length, "impostos", ri.linhas.length, "alíquota", ri.aliquota?.toFixed(3));
}

// Revisão e busca
const semCat = await rel.semCategoriaParaRevisar();
const categorizadas = await rel.categorizadasParaSugerir();
console.log("revisar", semCat.length, "sem categoria;", categorizadas.length, "categorizadas");
assert.ok((await rel.buscarContrapartes("maria", "2025-11-01")).length === 1);
assert.ok((await rel.buscarPessoasPorNome("mar")).length >= 1);
assert.ok((await rel.buscarCategoriasPorNome("sal")).length >= 1);
await rel.listarAuditoria({ q: "x" });
await rel.listarAuditoria({});
assert.equal((await rel.listarUsuarios()).length, 1);
await rel.categoriasComLinha();

// Alertas e recorrências
const d = await ale.dadosParaAlertas(hoje);
console.log("alertas dados:", { saldo: d.saldoCentavos, ultima: d.ultimaData, categorias: d.categorias.length, grandes: d.semCategoriaGrandes.length, metas: d.pessoasComMeta.length, novos: d.fornecedoresNovos.length, impostos: d.impostos.map((i) => `${i.nome}@${i.diaHabitual}x${i.mesesComPagamento}${i.pagoNoMes ? "+" : "-"}`) });
assert.equal(d.pessoasComMeta[0]?.pagoNoMes, 90000);
assert.ok(d.fornecedoresNovos.some((f) => f.nome.includes("Novo Fornecedor")));
const disparados = await ale.alertasDisparados(hoje);
console.log("disparados:", disparados.map((a) => `${a.tipo}: ${a.titulo}`));
assert.ok(disparados.some((a) => a.tipo === "saldo_minimo"));
assert.ok(disparados.some((a) => a.tipo === "fornecedor_novo"));
assert.ok(disparados.some((a) => a.tipo === "lancamento_grande_sem_categoria"));
const prev = await rec.previsoesDoMes(hoje);
console.log("previsões:", prev.map((p) => `${p.dataPrevista} ${p.nome} ${p.valorCentavos} ${p.pagoNoMes ? "pago" : ""}`));
assert.ok(prev.some((p) => p.nome.includes("Imobiliaria")));
assert.ok(prev.some((p) => /SIMPLES/.test(p.nome) && p.pagoNoMes));
await ale.listarAlertas();

// DRE do mês
const somas = await fin.somasPorMesECategoria("2026-10-01", "2026-11-01");
assert.ok(somas.length > 0);
await db.execute(sql`select 1`);
console.log("TUDO OK");
process.exit(0);
