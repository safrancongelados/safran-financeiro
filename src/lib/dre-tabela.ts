/**
 * Transforma a DRE montada nas linhas da tabela mensal — compartilhado entre
 * a DRE e o fluxo de caixa. Sem I/O.
 */
import type { LinhaTabela } from "@/components/tabela-mensal";
import type { Dre, LinhaMontada } from "./dre";

const hrefCategoria = (id: string) => (mes: string) => `/extrato?mes=${mes}&categoria=${id}`;
const hrefSemCategoria = (mes: string) => `/extrato?mes=${mes}&sem=1`;

function bloco(l: LinhaMontada): LinhaTabela[] {
  return [
    { tipo: "grupo", label: l.linha.nome, serie: l },
    ...l.categorias.map(
      (c): LinhaTabela => ({ tipo: "categoria", label: c.categoria.nome, serie: c, href: hrefCategoria(c.categoria.id) })
    ),
  ];
}

function linhaSemCategoria(dre: Dre): LinhaTabela[] {
  const temAlgo = dre.semCategoria.total !== 0 || Object.values(dre.semCategoria.porMes).some((v) => v !== 0);
  return temAlgo ? [{ tipo: "alerta", label: "Sem categoria", serie: dre.semCategoria, href: hrefSemCategoria }] : [];
}

/**
 * A DRE na ordem configurada: grupos com as categorias, subtotais (o último
 * em destaque) com o % sobre a linha base quando pedido, e depois o que fica
 * fora da DRE. `comPercentual: false` esconde os % (ex.: filtrando por centro,
 * a receita some e o % perde sentido).
 */
export function linhasDaDre(dre: Dre, { comPercentual }: { comPercentual: boolean }): LinhaTabela[] {
  const naDre = dre.linhas.filter((l) => l.linha.secao === "dre");
  const fora = dre.linhas.filter((l) => l.linha.secao !== "dre" && l.linha.tipo === "grupo");
  const ultimoSubtotal = [...naDre].reverse().find((l) => l.linha.tipo === "subtotal");

  const linhas: LinhaTabela[] = [];
  for (const l of naDre) {
    if (l.linha.tipo === "grupo") {
      linhas.push(...bloco(l));
      continue;
    }
    linhas.push({ tipo: l === ultimoSubtotal ? "destaque" : "subtotal", label: `= ${l.linha.nome}`, serie: l });
    if (comPercentual && l.linha.mostrarPercentual && dre.base) {
      linhas.push({ tipo: "percentual", label: `% sobre ${dre.base.linha.nome}`, parte: l, base: dre.base });
    }
  }
  // Sem subtotal configurado, o resultado ainda aparece.
  if (!ultimoSubtotal) linhas.push({ tipo: "destaque", label: "= Resultado", serie: dre.resultado });

  if (fora.length > 0) {
    linhas.push({ tipo: "secao", label: "Fora da DRE — só mexem no caixa" });
    for (const l of fora) linhas.push(...bloco(l));
  }
  linhas.push(...linhaSemCategoria(dre));
  linhas.push({ tipo: "subtotal", label: "= Variação do caixa", serie: dre.variacaoCaixa });
  return linhas;
}

/** O miolo do fluxo de caixa: operação (o resultado da DRE) e cada linha de fora da DRE. */
export function movimentoDoFluxo(dre: Dre): LinhaTabela[] {
  return [
    { tipo: "grupo", label: "Operação (resultado da DRE)", serie: dre.resultado },
    ...dre.linhas
      .filter((l) => l.linha.secao !== "dre" && l.linha.tipo === "grupo")
      .map((l): LinhaTabela => ({ tipo: "categoria", label: l.linha.nome, serie: l })),
    ...linhaSemCategoria(dre),
  ];
}
