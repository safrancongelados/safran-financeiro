/**
 * Os módulos puros, com números na mão: pareamento de estornos,
 * reconhecimento de pessoas, filtros do extrato, motor de alertas,
 * previsão de recorrências, sugestões da revisão e relatórios.
 *
 *   npm test
 */
import assert from "node:assert/strict";
import { parearEstornos, eEstorno } from "../src/lib/estornos";
import { indexarPessoas, reconhecerPessoa, identificadorDe, lerPadroes, normalizarDocumento } from "../src/lib/pessoas";
import { identidadesDe } from "../src/lib/regras";
import { alternarOrdem, comVisao, lerFiltroExtrato, intervaloDoFiltro, paramsExtrato, rotuloDoPeriodo } from "../src/lib/extrato-filtros";
import { agruparIguais, ordenarGrupos } from "../src/lib/extrato";
import { avaliarAlertas, type ConfigAlerta, type DadosParaAlertas } from "../src/lib/alertas";
import { preverRecorrencias } from "../src/lib/recorrencias";
import { gruposParaRevisar } from "../src/lib/revisao";
import { pivotarPorMes, tendencia } from "../src/lib/relatorios";
import { lerPeriodo, mesesDoPeriodo } from "../src/lib/periodo";

// ── estornos ────────────────────────────────────────
{

const C = "conta";
const m = (id: string, data: string, valorCentavos: number, descricao: string) => ({ id, contaId: C, data, valorCentavos, descricao });

const movs = [
  // DARF: três tentativas e três reembolsos no mesmo dia
  m("darf1", "2026-07-21", -17831, "Pagamento de conta DARF - CÓDIGO DE  BARRA"),
  m("darf2", "2026-07-21", -17831, "Pagamento de conta DARF - CÓDIGO DE  BARRA"),
  m("darf3", "2026-07-21", -17831, "Pagamento de conta DARF - CÓDIGO DE  BARRA"),
  m("reemb1", "2026-07-21", 17831, "Reembolso de pagamento de conta ITAU UNIBANCO"),
  m("reemb2", "2026-07-21", 17831, "Reembolso de pagamento de conta ITAU UNIBANCO"),
  m("reemb3", "2026-07-21", 17831, "Reembolso de pagamento de conta ITAU UNIBANCO"),
  // Reembolso de setembro, mesmo valor: não pode roubar uma ida de julho (fora da janela)
  m("reembSet", "2026-09-21", 17831, "Reembolso de pagamento de conta ITAU UNIBANCO"),
  // QR Pix cancelado: três candidatas no mesmo dia, ganha a de mesmo nome
  m("cicero", "2025-11-24", -1000, "Pagamento com QR Pix Cicero Paulino da Silva"),
  m("renil1", "2025-11-24", -1000, "Pagamento com QR Pix RENILSON WAGNER DOS SANTOS"),
  m("renilPix", "2025-11-24", -1000, "Transferência Pix enviada Renilson Wagner dos Santos"),
  m("cancRenil", "2025-11-24", 1000, "Pagamento com código QR Pix - Cancelado RENILSON WAGNER DOS SANTOS"),
  // Uber: ida quatro dias antes
  m("uber", "2026-07-11", -1799, "Uber *trip help.uber.com"),
  m("uberReemb", "2026-07-15", 1799, "Reembolso de pagamento Uber"),
  // Venda cancelada: a ida é uma entrada e o estorno uma saída
  m("lib", "2026-03-25", 28605, "Liberação de dinheiro"),
  m("libCanc", "2026-03-25", -28605, "Liberação de dinheiro cancelada Venda cancelada"),
  // Lançamento comum de mesmo valor não é estorno
  m("venda", "2026-03-26", 28605, "Liberação de dinheiro"),
];

const pares = parearEstornos(movs);
console.log(Object.fromEntries(pares));

assert.equal(new Set([pares.get("reemb1"), pares.get("reemb2"), pares.get("reemb3")]).size, 3, "cada DARF usado uma vez");
assert.ok(["darf1", "darf2", "darf3"].includes(pares.get("reemb1")!));
assert.equal(pares.get("reembSet"), undefined, "setembro não encontra ida");
assert.equal(pares.get("cancRenil"), "renil1", "ganha a candidata com mais palavras em comum");
assert.equal(pares.get("uberReemb"), "uber");
assert.equal(pares.get("libCanc"), "lib");
assert.equal(pares.has("venda"), false);
assert.ok(eEstorno("Transferência cancelada Jose Adeilton"));
assert.ok(!eEstorno("Transferência enviada Jose Adeilton"));
assert.ok(!eEstorno("Pagamento de conta DARF"));


}

// ── pessoas ────────────────────────────────────────
{

const pessoas = [
  { id: "maria", documento: null, padroes: ["maria luisinha"], ativa: true },
  { id: "forn", documento: "12345678000199", padroes: [], ativa: true },
  { id: "inativa", documento: null, padroes: ["jose"], ativa: false },
];
const idx = indexarPessoas(pessoas);
assert.equal(reconhecerPessoa({ contraparte: "MARIA LUISINHA DA SILVA", contraparteDocumento: "***123", descricao: "Pix enviado" }, idx)?.id, "maria");
assert.equal(reconhecerPessoa({ contraparte: null, contraparteDocumento: null, descricao: "Pix enviado Maria Luisinha" }, idx)?.id, "maria");
assert.equal(reconhecerPessoa({ contraparte: "X", contraparteDocumento: "12345678000199", descricao: "boleto" }, idx)?.id, "forn");
assert.equal(reconhecerPessoa({ contraparte: "Jose", contraparteDocumento: null, descricao: "Pix" }, idx), null);
assert.deepEqual(identificadorDe({ contraparte: null, contraparteDocumento: null, descricao: "Pix enviado Maria Luisinha" }), { padrao: "maria luisinha" });
assert.deepEqual(identificadorDe({ contraparte: "Cencosud", contraparteDocumento: "39346861000161", descricao: "x" }), { documento: "39346861000161" });
assert.deepEqual(lerPadroes("Maria Luisinha\n; ab ;josé"), ["maria luisinha", "jose"]);
assert.deepEqual(normalizarDocumento("123.456.789-01"), { ok: true, documento: "12345678901" });
assert.deepEqual(normalizarDocumento("123"), { ok: false });

const ids = identidadesDe({ valorCentavos: -100, contraparte: "Maria", contraparteDocumento: "12345678901", descricao: "Pix enviado Maria" });
assert.deepEqual(ids.map((i) => i.campo), ["documento", "contraparte", "descricao"]);

const ok = (m: string) => /^\d{4}-\d{2}$/.test(m);
const f1 = lerFiltroExtrato({ periodo: "6m", min: "150,50", pessoa: "sem" }, "2026-10", ok);
assert.deepEqual(intervaloDoFiltro(f1, "2026-10-27"), { inicio: "2026-05-01", fim: "2026-11-01" });
assert.equal(f1.min, 15050);
assert.equal(paramsExtrato(f1).toString(), "periodo=6m&pessoa=sem&min=150%2C50");
const f2 = lerFiltroExtrato({ de: "2026-01-10", ate: "2026-01-31", mes: "2026-10" }, "2026-10", ok);
assert.deepEqual(intervaloDoFiltro(f2, "2026-10-27"), { inicio: "2026-01-10", fim: "2026-02-01" });
assert.equal(rotuloDoPeriodo(f2, "2026-10-27"), "10/01/2026 a 31/01/2026");
const f3 = lerFiltroExtrato({ de: "2026-02-10", ate: "2026-01-31" }, "2026-10", ok);
assert.equal(f3.de, undefined);
assert.deepEqual(intervaloDoFiltro(lerFiltroExtrato({ periodo: "ano" }, "2026-10", ok), "2026-10-27"), { inicio: "2026-01-01", fim: "2026-11-01" });

// Ordenação da visão por nome: vai na URL como a de lançamentos, mas por colunas próprias.
const fNomes = lerFiltroExtrato({ periodo: "12m", visao: "nomes", ordem: "quantidade" }, "2026-10", ok);
assert.equal(fNomes.ordem, "quantidade");
assert.equal(paramsExtrato(fNomes).toString(), "periodo=12m&ordem=quantidade&visao=nomes");
assert.equal(paramsExtrato(alternarOrdem(fNomes, "quantidade")).toString(), "periodo=12m&ordem=quantidade&dir=asc&visao=nomes");
assert.equal(paramsExtrato(alternarOrdem(fNomes, "nome")).toString(), "periodo=12m&ordem=nome&visao=nomes");
// Trocar de visão esquece a ordem que a outra não tem, e mantém a que as duas têm.
assert.equal(paramsExtrato(comVisao(fNomes, "lancamentos")).toString(), "periodo=12m");
assert.equal(paramsExtrato(comVisao(alternarOrdem(fNomes, "valor"), "lancamentos")).toString(), "periodo=12m&ordem=valor");
assert.equal(paramsExtrato(comVisao(lerFiltroExtrato({ mes: "2026-10", ordem: "data", dir: "asc" }, "2026-10", ok), "nomes")).toString(), "mes=2026-10&visao=nomes");

const g = (id: string, data: string, valorCentavos: number, descricao: string, nomeExibicao: string | null = null) => ({
  id, data, valorCentavos, descricao, nomeExibicao, categoriaId: null, contraparte: null, contraparteDocumento: null,
});
const grupos = agruparIguais([
  g("a1", "2026-10-01", -1000, "Pagamento G Barbosa"),
  g("a2", "2026-10-02", -1000, "Pagamento G Barbosa"),
  g("a3", "2026-10-03", -1000, "Pagamento G Barbosa"),
  g("b1", "2026-10-04", -50000, "Pix enviado Glaucos", "Álvaro"),
  g("c1", "2026-10-05", 20000, "Pix recebido Maria"),
  g("c2", "2026-10-06", 20000, "Pix recebido Maria"),
]);
const nomes = (gs: typeof grupos) => gs.map((x) => x.exemplo.nomeExibicao ?? x.descricao);
// Padrão de agruparIguais: saídas primeiro, depois as de mais lançamentos.
assert.deepEqual(nomes(grupos), ["Pagamento G Barbosa", "Álvaro", "Pix recebido Maria"]);
assert.equal(ordenarGrupos(grupos, undefined, "desc"), grupos);
assert.equal(ordenarGrupos(grupos, "data", "desc"), grupos);
assert.deepEqual(nomes(ordenarGrupos(grupos, "quantidade", "desc")), ["Pagamento G Barbosa", "Pix recebido Maria", "Álvaro"]);
assert.deepEqual(nomes(ordenarGrupos(grupos, "quantidade", "asc")), ["Álvaro", "Pix recebido Maria", "Pagamento G Barbosa"]);
// Total pelo tamanho, não pelo sinal: a saída de 500 vem antes da entrada de 400.
assert.deepEqual(nomes(ordenarGrupos(grupos, "valor", "desc")), ["Álvaro", "Pix recebido Maria", "Pagamento G Barbosa"]);
assert.deepEqual(nomes(ordenarGrupos(grupos, "valor", "asc")), ["Pagamento G Barbosa", "Pix recebido Maria", "Álvaro"]);
// Por nome, o nome de exibição vale, sem acento e sem caixa.
assert.deepEqual(nomes(ordenarGrupos(grupos, "nome", "asc")), ["Álvaro", "Pagamento G Barbosa", "Pix recebido Maria"]);
assert.deepEqual(nomes(ordenarGrupos(grupos, "nome", "desc")), ["Pix recebido Maria", "Pagamento G Barbosa", "Álvaro"]);
// Não mexe na lista original.
assert.deepEqual(nomes(grupos), ["Pagamento G Barbosa", "Álvaro", "Pix recebido Maria"]);


}

// ── onda2 ────────────────────────────────────────
{

// Alertas
const configs: ConfigAlerta[] = [
  { tipo: "saldo_minimo", parametros: { valorCentavos: 500000 }, ativo: true },
  { tipo: "despesa_acima_media", parametros: { percentual: 30, minimoCentavos: 50000 }, ativo: true },
  { tipo: "lancamento_grande_sem_categoria", parametros: { valorCentavos: 100000 }, ativo: true },
  { tipo: "pessoa_acima_meta", parametros: {}, ativo: true },
  { tipo: "fornecedor_novo", parametros: { valorCentavos: 100000, dias: 30 }, ativo: true },
  { tipo: "sync_parado", parametros: { dias: 3 }, ativo: true },
  { tipo: "imposto_previsto", parametros: { toleranciaDias: 3 }, ativo: true },
];
const dados: DadosParaAlertas = {
  hoje: "2026-10-27",
  saldoCentavos: 78005,
  ultimaData: "2026-10-25",
  categorias: [
    { id: "c1", nome: "Insumos", ultimoMes: "2026-09", ultimo: -140000, anteriores: [-100000, -100000, -100000] },
    { id: "c2", nome: "Pequena", ultimoMes: "2026-09", ultimo: -20000, anteriores: [-10000, -10000, -10000] },
    { id: "c3", nome: "Estável", ultimoMes: "2026-09", ultimo: -100000, anteriores: [-100000, -100000, 0] },
  ],
  semCategoriaGrandes: [{ id: "m1", data: "2026-10-20", descricao: "TED grande", valorCentavos: -250000 }, { id: "m2", data: "2026-10-21", descricao: "pequeno", valorCentavos: -5000 }],
  pessoasComMeta: [{ id: "p1", nome: "Isabel", metaCentavos: 400000, pagoNoMes: 499500 }, { id: "p2", nome: "Glaucos", metaCentavos: 300000, pagoNoMes: 172670 }],
  fornecedoresNovos: [{ nome: "Novo Ltda", primeiraData: "2026-10-10", totalCentavos: -150000, lancamentos: 2 }, { nome: "Pequeno", primeiraData: "2026-10-12", totalCentavos: -1000, lancamentos: 1 }],
  impostos: [
    { id: "i1", nome: "Simples Nacional (DAS)", diaHabitual: 20, mesesComPagamento: 5, pagoNoMes: false },
    { id: "i2", nome: "DARF", diaHabitual: 25, mesesComPagamento: 2, pagoNoMes: false },
    { id: "i3", nome: "ISS", diaHabitual: 10, mesesComPagamento: 6, pagoNoMes: true },
  ],
};
const disparados = avaliarAlertas(configs, dados);
const tipos = disparados.map((a) => a.tipo);
assert.deepEqual(tipos.filter((t) => t === "saldo_minimo").length, 1);
assert.equal(disparados.filter((a) => a.tipo === "despesa_acima_media").length, 1, "só Insumos (Pequena abaixo do mínimo, Estável sem variação)");
assert.equal(disparados.filter((a) => a.tipo === "lancamento_grande_sem_categoria").length, 1);
assert.equal(disparados.filter((a) => a.tipo === "pessoa_acima_meta").length, 1);
assert.equal(disparados.filter((a) => a.tipo === "fornecedor_novo").length, 1);
assert.equal(disparados.filter((a) => a.tipo === "sync_parado").length, 0, "2 dias não passa de 3");
assert.equal(disparados.filter((a) => a.tipo === "imposto_previsto").length, 1, "só o DAS (DARF com poucos meses, ISS já pago)");
assert.equal(disparados[0].gravidade, "alta");
assert.equal(avaliarAlertas(configs.map((c) => ({ ...c, ativo: false })), dados).length, 0);

// Recorrências
const m = (id: string, data: string, v: number, descricao: string, contraparte: string | null = null) => ({
  id, data, valorCentavos: v, descricao, contraparte, contraparteDocumento: null, nomeExibicao: null, categoriaId: "x", categoriaNome: "Aluguel",
});
const saidas = [
  m("a1", "2026-06-05", -250000, "Pix enviado Imobiliaria"),
  m("a2", "2026-07-06", -250000, "Pix enviado Imobiliaria"),
  m("a3", "2026-08-05", -250000, "Pix enviado Imobiliaria"),
  m("a4", "2026-09-05", -260000, "Pix enviado Imobiliaria"),
  m("d1", "2026-07-20", -81900, "Pagamento de conta SIMPLES NACIONAL"),
  m("d2", "2026-08-20", -82000, "Pagamento de conta SIMPLES NACIONAL"),
  m("d3", "2026-09-19", -83000, "Pagamento de conta SIMPLES NACIONAL"),
  m("d4", "2026-10-20", -84000, "Pagamento de conta SIMPLES NACIONAL"),
  m("u1", "2026-09-01", -1000, "Uber"),
];
const prev = preverRecorrencias(saidas, "2026-10-27");
assert.equal(prev.length, 2);
const aluguel = prev.find((p) => p.nome.includes("Imobiliaria"))!;
assert.equal(aluguel.dia, 5);
assert.equal(aluguel.dataPrevista, "2026-11-05", "outubro ainda não saiu mas o dia 5 já passou → novembro");
assert.equal(aluguel.valorCentavos, -250000);
assert.equal(aluguel.pagoNoMes, false);
const das = prev.find((p) => p.nome.includes("SIMPLES"))!;
assert.equal(das.pagoNoMes, true);
assert.equal(das.dataPrevista, "2026-11-20");

// Revisão
const sem = [
  { id: "s1", data: "2026-10-20", valorCentavos: -500, contraparte: "Maria Luisinha", contraparteDocumento: null, descricao: "Pix enviado Maria Luisinha", nomeExibicao: null, categoriaId: null },
  { id: "s2", data: "2026-10-21", valorCentavos: -600, contraparte: "Maria Luisinha", contraparteDocumento: null, descricao: "Pix enviado Maria Luisinha", nomeExibicao: null, categoriaId: null },
  { id: "s3", data: "2026-10-21", valorCentavos: -600, contraparte: null, contraparteDocumento: null, descricao: "Pagamento de conta ENERGIA XYZ", nomeExibicao: null, categoriaId: null },
  { id: "s4", data: "2026-10-22", valorCentavos: 900, contraparte: "Cliente Novo", contraparteDocumento: null, descricao: "Pix recebido Cliente Novo", nomeExibicao: null, categoriaId: null },
];
const cat = [
  { valorCentavos: -700, contraparte: "Maria Luisinha", contraparteDocumento: null, descricao: "Pix enviado Maria Luisinha", categoriaId: "salarios" },
  { valorCentavos: -500, contraparte: null, contraparteDocumento: null, descricao: "Pagamento de conta ENERGIA ABC", categoriaId: "energia" },
  { valorCentavos: -500, contraparte: null, contraparteDocumento: null, descricao: "Pagamento de conta ENERGIA DEF", categoriaId: "energia" },
];
const grupos = gruposParaRevisar(sem, cat);
assert.equal(grupos.length, 3);
assert.equal(grupos.find((g) => g.exemplo.contraparte === "Maria Luisinha")!.sugestao?.categoriaId, "salarios");
assert.equal(grupos.find((g) => g.exemplo.id === "s3")!.sugestao?.categoriaId, "energia");
assert.equal(grupos.find((g) => g.exemplo.id === "s4")!.sugestao, null);

// Relatórios
const linhas = pivotarPorMes(
  [
    { chave: "a", mes: "2026-07", valorCentavos: -100, lancamentos: 1 },
    { chave: "a", mes: "2026-08", valorCentavos: -100, lancamentos: 1 },
    { chave: "a", mes: "2026-09", valorCentavos: -100, lancamentos: 1 },
    { chave: "a", mes: "2026-10", valorCentavos: -200, lancamentos: 2 },
    { chave: "b", mes: "2026-10", valorCentavos: -50, lancamentos: 1 },
  ],
  ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
);
assert.equal(linhas[0].chave, "a");
assert.equal(linhas[0].total, -500);
assert.equal(linhas[0].media, -125);
assert.equal(tendencia(linhas[0], ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]), (-400 - -100) / 100);
assert.deepEqual(lerPeriodo({ periodo: "6m" }, "2026-10-27"), { tipo: "meses", n: 6 });
assert.equal(mesesDoPeriodo({ tipo: "meses", n: 3 }, "2026-10").join(","), "2026-08,2026-09,2026-10");

}

console.log("lógica ok");
