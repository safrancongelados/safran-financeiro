"use server";

import { buscarCategoriasPorNome, buscarContrapartes, buscarPessoasPorNome } from "@/db/queries/relatorios";
import { obterSessao } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dinheiro";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { TIPO_PESSOA_LABEL } from "@/lib/pessoas";
import { deslocarMes, mesAtual } from "@/lib/periodo";

export interface ResultadoBusca {
  grupo: "Pessoas" | "Categorias" | "Contrapartes";
  titulo: string;
  detalhe?: string;
  href: string;
}

/**
 * A busca global (Ctrl+K): pessoas, categorias e contrapartes que contêm o
 * texto, cada uma levando ao lugar certo — a página da pessoa ou o extrato
 * dos últimos 12 meses já filtrado. As páginas do sistema são filtradas no
 * cliente, sem passar por aqui.
 */
export async function buscarGlobalAction(q: string): Promise<ResultadoBusca[]> {
  if (!(await obterSessao())) return [];
  const termo = q.trim().slice(0, 60);
  if (termo.length < 2) return [];
  const mes = mesAtual();
  const inicio = `${deslocarMes(mes, -11)}-01`;

  const [pessoas, categorias, contrapartes] = await Promise.all([
    buscarPessoasPorNome(termo),
    buscarCategoriasPorNome(termo),
    buscarContrapartes(termo, inicio),
  ]);

  return [
    ...pessoas.map((p): ResultadoBusca => ({ grupo: "Pessoas", titulo: p.nome, detalhe: TIPO_PESSOA_LABEL[p.tipo], href: `/pessoas/${p.id}` })),
    ...categorias.map((c): ResultadoBusca => ({
      grupo: "Categorias",
      titulo: c.nome,
      detalhe: "extrato dos últimos 12 meses",
      href: hrefExtrato({ mes, periodo: "12m", categoria: c.id }),
    })),
    ...contrapartes.map((c): ResultadoBusca => ({
      grupo: "Contrapartes",
      titulo: c.nome,
      detalhe: `${c.lancamentos} lançamento(s) · ${formatarCentavos(Number(c.totalCentavos))} em 12 meses`,
      href: hrefExtrato({ mes, periodo: "12m", q: c.nome.slice(0, 80) }),
    })),
  ];
}
