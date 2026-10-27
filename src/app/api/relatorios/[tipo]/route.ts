import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";
import { hojeISO, lerPeriodo, rotuloMesAno, rotuloPeriodo } from "@/lib/periodo";
import { relatorioCustos, relatorioFornecedores, relatorioImpostos, relatorioPessoal } from "@/lib/relatorios-dados";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/** Os relatórios em CSV, com o mesmo período da tela. Protegido pela sessão. */
export async function GET(request: Request, { params }: RouteContext<"/api/relatorios/[tipo]">) {
  if (!(await obterSessao())) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { tipo } = await params;
  const q = Object.fromEntries(new URL(request.url).searchParams.entries());
  const hoje = hojeISO();
  const periodo = lerPeriodo(q, hoje);

  let cabecalho: string[];
  let linhas: (string | number | null)[][];

  switch (tipo) {
    case "pessoal": {
      const r = await relatorioPessoal(periodo, hoje);
      cabecalho = ["Pessoa", "Tipo", "Meta mensal (R$)", ...r.meses.map(rotuloMesAno), "Total (R$)", "Média (R$)", "Acima da meta (R$)"];
      linhas = [...r.cadastradas, ...r.semCadastro].map((l) => [
        l.nome,
        l.tipo,
        l.metaMensalCentavos == null ? "" : reais(l.metaMensalCentavos),
        ...r.meses.map((m) => reais(-(l.porMes[m] ?? 0))),
        reais(-l.total),
        reais(-l.media),
        reais(l.acimaDaMeta),
      ]);
      break;
    }
    case "custos": {
      const r = await relatorioCustos(periodo, hoje);
      cabecalho = ["Categoria", "Linha da DRE", ...r.meses.map(rotuloMesAno), "Total (R$)", "% dos custos", "Maiores contrapartes"];
      linhas = r.linhas.map((l) => [
        l.nome,
        l.linhaNome,
        ...r.meses.map((m) => reais(-(l.porMes[m] ?? 0))),
        reais(-l.total),
        `${Math.round(l.parte * 100)}%`,
        l.top.map((t) => `${t.nome} (${reais(-t.totalCentavos)})`).join(" | "),
      ]);
      break;
    }
    case "fornecedores": {
      const r = await relatorioFornecedores(periodo, hoje, 1000);
      cabecalho = ["Fornecedor", "CPF/CNPJ", "Categoria habitual", ...r.meses.map(rotuloMesAno), "Total (R$)", "Lançamentos", "Média mensal (R$)"];
      linhas = r.linhas.map((l) => [l.nome, l.documento, l.categoriaNome, ...r.meses.map((m) => reais(-(l.porMes[m] ?? 0))), reais(-l.total), l.lancamentos, reais(-l.media)]);
      break;
    }
    case "impostos": {
      const r = await relatorioImpostos(periodo, hoje);
      cabecalho = ["Imposto", ...r.meses.map(rotuloMesAno), "Total (R$)"];
      linhas = [
        ...r.linhas.map((l) => [l.nome, ...r.meses.map((m) => reais(-(l.porMes[m] ?? 0))), reais(-l.total)]),
        ["Total de impostos", ...r.meses.map((m) => reais(-(r.totalPorMes[m] ?? 0))), reais(-r.total)],
        ["Receita bruta", ...r.meses.map((m) => reais(r.receitaPorMes[m] ?? 0)), reais(r.receitaTotal)],
      ];
      break;
    }
    default:
      return NextResponse.json({ erro: "relatório desconhecido" }, { status: 404 });
  }

  const csv = `﻿${cabecalho.map(campo).join(";")}\n${linhas.map((l) => l.map(campo).join(";")).join("\n")}\n`;
  const nome = `${tipo}-${rotuloPeriodo(periodo).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
