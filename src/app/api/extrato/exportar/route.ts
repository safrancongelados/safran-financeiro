import { NextResponse } from "next/server";
import { listarCentrosCusto, listarMovimentacoes } from "@/db/queries/financeiro";
import { obterSessao } from "@/lib/auth";
import { lerFiltroExtrato, rotuloDoPeriodo } from "@/lib/extrato-filtros";
import { hojeISO, mesAtual, mesValido } from "@/lib/periodo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Campo CSV: aspas quando preciso, no padrão que o Excel em português abre direto (separador ";"). */
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** "1234,56", com vírgula, como o Excel em português espera. */
function reais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * O extrato com os mesmos filtros da tela, em CSV. Protegido pela sessão
 * (o proxy barra quem não está logado).
 */
export async function GET(request: Request) {
  if (!(await obterSessao())) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const hoje = hojeISO();
  const filtro = lerFiltroExtrato(params, mesAtual(), mesValido);
  const [linhas, centros] = await Promise.all([listarMovimentacoes(filtro, hoje), listarCentrosCusto()]);
  const nomeCentro = new Map(centros.map((c) => [c.id, c.nome]));

  const cabecalho = ["Data", "Nome", "Descrição do banco", "Contraparte", "CPF/CNPJ", "Pessoa", "Categoria", "Centro", "Meio", "Valor (R$)", "Observação"];
  const corpo = linhas.map((l) =>
    [
      l.data,
      l.nomeExibicao ?? l.descricao,
      l.descricao,
      l.contraparte,
      l.contraparteDocumento,
      l.pessoaNome,
      l.categoriaNome ?? "",
      l.centroCustoId ? (nomeCentro.get(l.centroCustoId) ?? "") : "",
      l.meio,
      reais(l.valorCentavos),
      l.observacao,
    ]
      .map(campo)
      .join(";")
  );
  // BOM para o Excel reconhecer o UTF-8 (acentos).
  const csv = `﻿${cabecalho.join(";")}\n${corpo.join("\n")}\n`;
  const nome = `extrato-${rotuloDoPeriodo(filtro, hoje).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
