import Link from "next/link";
import { Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { hojeISO, lerPeriodo, rotuloMesAno } from "@/lib/periodo";
import { relatorioCustos } from "@/lib/relatorios-dados";
import { StatTile } from "@/components/stat-tile";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BarraRelatorio, LinkPessoa, Variacao } from "../relatorio-comum";

export const dynamic = "force-dynamic";

export default async function RelatorioCustosPage({ searchParams }: PageProps<"/relatorios/custos">) {
  const params = await searchParams;
  const hoje = hojeISO();
  const mesCorrente = hoje.slice(0, 7);
  const periodo = lerPeriodo(params, hoje);
  const r = await relatorioCustos(periodo, hoje);
  const receitaTotal = r.meses.reduce((acc, m) => acc + (r.receitaPorMes[m] ?? 0), 0);
  const maior = r.linhas[0];
  const subindo = r.linhas.filter((l) => l.tendencia !== null && l.tendencia > 0.15).length;

  return (
    <>
      <BarraRelatorio tipo="custos" periodo={periodo} hoje={hoje} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Receipt} label="Custos no período" value={formatarCentavos(-r.total)} hint={receitaTotal > 0 ? `${formatarPercentual(-r.total, receitaTotal)} da receita` : undefined} />
        <StatTile icon={Receipt} label="Média mensal" value={formatarCentavos(r.meses.length ? Math.round(-r.total / r.meses.length) : 0)} hint={`${r.meses.length} mês(es)`} />
        <StatTile icon={TrendingUp} label="Maior categoria" value={maior ? formatarCentavos(-maior.total) : "—"} hint={maior ? `${maior.nome} · ${Math.round(maior.parte * 100)}%` : undefined} />
        <StatTile icon={TrendingDown} label="Subindo" value={String(subindo)} hint="categorias com +15% nos últimos 3 meses" tone={subindo > 0 ? "warning" : "success"} />
      </div>

      <Card className="overflow-hidden py-0">
        <div className="relative w-full overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Categoria</TableHead>
                {r.meses.map((m) => (
                  <TableHead key={m} className={cn("text-right", m === mesCorrente && "bg-primary/5 text-foreground")}>
                    {rotuloMesAno(m)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">% custos</TableHead>
                <TableHead className="text-right" title="Último mês fechado contra o anterior">
                  Mês
                </TableHead>
                <TableHead className="text-right" title="Média dos últimos 3 meses contra os 3 anteriores">
                  3 meses
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.linhas.map((l) => (
                <TableRow key={l.chave} className="group">
                  <TableCell className="sticky left-0 z-10 max-w-64 whitespace-normal bg-card">
                    <span className="font-medium text-foreground">{l.nome}</span>
                    <span className="block text-xs text-muted-foreground">{l.linhaNome}</span>
                    {l.top.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {l.top.slice(0, 3).map((t) => (
                          <li key={t.nome} className="flex justify-between gap-2">
                            <span className="truncate">
                              <LinkPessoa id={t.pessoaId} nome={t.nome} />
                            </span>
                            <span className="shrink-0 tabular-nums">{formatarCentavos(-t.totalCentavos)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </TableCell>
                  {r.meses.map((m) => {
                    const v = l.porMes[m] ?? 0;
                    return (
                      <TableCell key={m} className={cn("text-right tabular-nums align-top", m === mesCorrente && "bg-primary/5")}>
                        {v === 0 ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <Link href={hrefExtrato({ mes: m, categoria: l.chave })} className="hover:underline">
                            {formatarCentavos(-v)}
                          </Link>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-medium tabular-nums align-top">{formatarCentavos(-l.total)}</TableCell>
                  <TableCell className="text-right tabular-nums align-top text-muted-foreground">{Math.round(l.parte * 100)}%</TableCell>
                  <TableCell className="text-right tabular-nums align-top">
                    <Variacao v={l.variacao === null ? null : -l.variacao} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-top">
                    <Variacao v={l.tendencia === null ? null : -l.tendencia} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary/40 font-semibold">
                <TableCell className="sticky left-0 z-10 bg-secondary">Total</TableCell>
                {r.meses.map((m) => (
                  <TableCell key={m} className="text-right tabular-nums">
                    {formatarCentavos(-(r.totalPorMes[m] ?? 0))}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{formatarCentavos(-r.total)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
              <TableRow className="text-xs text-muted-foreground">
                <TableCell className="sticky left-0 z-10 bg-card italic">% da receita</TableCell>
                {r.meses.map((m) => (
                  <TableCell key={m} className="text-right tabular-nums">
                    {formatarPercentual(-(r.totalPorMes[m] ?? 0), r.receitaPorMes[m] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{formatarPercentual(-r.total, receitaTotal)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Só saídas em categorias da DRE, em conta. Variação de custo para cima aparece em laranja. Embaixo de cada categoria, quem mais recebeu no período.
      </p>
    </>
  );
}
