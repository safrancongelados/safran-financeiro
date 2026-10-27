import Link from "next/link";
import { Building2, UserPlus } from "lucide-react";
import { formatarCentavos } from "@/lib/dinheiro";
import { formatarDocumento } from "@/lib/extrato";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { hojeISO, lerPeriodo, paramsDoPeriodo, rotuloMesAno } from "@/lib/periodo";
import { relatorioFornecedores } from "@/lib/relatorios-dados";
import { StatTile } from "@/components/stat-tile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BarraRelatorio, LinkPessoa, Variacao } from "../relatorio-comum";

export const dynamic = "force-dynamic";

export default async function RelatorioFornecedoresPage({ searchParams }: PageProps<"/relatorios/fornecedores">) {
  const params = await searchParams;
  const hoje = hojeISO();
  const periodo = lerPeriodo(params, hoje);
  const r = await relatorioFornecedores(periodo, hoje);
  const dez = r.linhas.slice(0, 10).reduce((acc, l) => acc + l.total, 0);
  const semCadastro = r.linhas.filter((l) => !l.pessoaId).length;
  const p = paramsDoPeriodo(periodo);
  const filtroPeriodo = p.periodo ? { periodo: p.periodo as "3m" | "6m" | "12m" } : { periodo: "ano" as const };

  return (
    <>
      <BarraRelatorio tipo="fornecedores" periodo={periodo} hoje={hoje} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Building2} label="Fornecedores" value={String(r.linhas.length)} hint="com saída no período" />
        <StatTile icon={Building2} label="Total pago" value={formatarCentavos(-r.total)} />
        <StatTile icon={Building2} label="Os 10 maiores" value={r.total ? `${Math.round((dez / r.total) * 100)}%` : "—"} hint="do total pago" />
        <StatTile icon={UserPlus} label="Sem cadastro" value={String(semCadastro)} hint="cadastre para somar por pessoa" tone={semCadastro > 0 ? "warning" : "success"} />
      </div>

      <Card className="overflow-hidden py-0">
        <div className="relative w-full overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead className="sticky left-0 z-10 bg-card">Fornecedor</TableHead>
                <TableHead>Categoria habitual</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Média mensal</TableHead>
                <TableHead className="text-right">Último mês</TableHead>
                <TableHead className="text-right" title="Média dos últimos 3 meses contra os 3 anteriores">
                  3 meses
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.linhas.map((l, i) => (
                <TableRow key={l.chave}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="sticky left-0 z-10 max-w-72 whitespace-normal bg-card">
                    <span className="font-medium text-foreground">
                      <LinkPessoa id={l.pessoaId} nome={l.nome} />
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {l.documento ? <span className="font-mono">{formatarDocumento(l.documento)}</span> : null}
                      {!l.pessoaId ? (
                        <>
                          {l.documento ? " · " : ""}
                          <Link
                            href={`/pessoas/nova?nome=${encodeURIComponent(l.nome)}${l.documento ? `&documento=${l.documento}` : ""}`}
                            className="underline-offset-2 hover:underline"
                          >
                            cadastrar
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-muted-foreground", !l.categoriaNome && "text-on-warning-soft")}>{l.categoriaNome ?? "sem categoria"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <Link href={hrefExtrato({ mes: hoje.slice(0, 7), ...filtroPeriodo, ...(l.pessoaId ? { pessoa: l.pessoaId } : { q: l.nome.slice(0, 80) }), tipo: "saida" })} className="hover:underline">
                      {formatarCentavos(-l.total)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{l.lancamentos}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatarCentavos(-l.media)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{l.ultimoMes ? rotuloMesAno(l.ultimoMes) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Variacao v={l.tendencia === null ? null : -l.tendencia} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Saídas em categorias da DRE, em conta, agrupadas pela pessoa cadastrada ou pelo nome da contraparte. Sócios e funcionários ficam no relatório de pessoal.
      </p>
    </>
  );
}
