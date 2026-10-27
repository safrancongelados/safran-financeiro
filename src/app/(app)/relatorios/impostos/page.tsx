import Link from "next/link";
import { Landmark, Percent } from "lucide-react";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { hojeISO, lerPeriodo, rotuloMesAno } from "@/lib/periodo";
import { relatorioImpostos } from "@/lib/relatorios-dados";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BarraRelatorio } from "../relatorio-comum";

export const dynamic = "force-dynamic";

export default async function RelatorioImpostosPage({ searchParams }: PageProps<"/relatorios/impostos">) {
  const params = await searchParams;
  const hoje = hojeISO();
  const mesCorrente = hoje.slice(0, 7);
  const periodo = lerPeriodo(params, hoje);
  const r = await relatorioImpostos(periodo, hoje);

  return (
    <>
      <BarraRelatorio tipo="impostos" periodo={periodo} hoje={hoje} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Landmark} label="Impostos no período" value={formatarCentavos(-r.total)} />
        <StatTile icon={Landmark} label="Receita bruta" value={formatarCentavos(r.receitaTotal)} />
        <StatTile icon={Percent} label="Alíquota efetiva" value={r.aliquota === null ? "—" : `${(r.aliquota * 100).toFixed(1).replace(".", ",")}%`} hint="impostos ÷ receita bruta" />
        <StatTile icon={Landmark} label="Média mensal" value={formatarCentavos(r.meses.length ? Math.round(-r.total / r.meses.length) : 0)} />
      </div>

      {r.linhas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma categoria de imposto com movimento"
          description="O relatório reconhece categorias com Simples, DAS, DARF, tributos, ISS, ICMS, INSS ou FGTS no nome."
          actionHref="/configuracoes"
          actionLabel="Ver o plano de contas"
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="relative w-full overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Imposto</TableHead>
                  {r.meses.map((m) => (
                    <TableHead key={m} className={cn("text-right", m === mesCorrente && "bg-primary/5 text-foreground")}>
                      {rotuloMesAno(m)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.linhas.map((l) => (
                  <TableRow key={l.chave}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">{l.nome}</TableCell>
                    {r.meses.map((m) => {
                      const v = l.porMes[m] ?? 0;
                      return (
                        <TableCell key={m} className={cn("text-right tabular-nums", m === mesCorrente && "bg-primary/5")}>
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
                    <TableCell className="text-right font-medium tabular-nums">{formatarCentavos(-l.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary/40 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-secondary">Total de impostos</TableCell>
                  {r.meses.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {formatarCentavos(-(r.totalPorMes[m] ?? 0))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatarCentavos(-r.total)}</TableCell>
                </TableRow>
                <TableRow className="text-muted-foreground">
                  <TableCell className="sticky left-0 z-10 bg-card">Receita bruta</TableCell>
                  {r.meses.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {formatarCentavos(r.receitaPorMes[m] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatarCentavos(r.receitaTotal)}</TableCell>
                </TableRow>
                <TableRow className="text-xs text-muted-foreground">
                  <TableCell className="sticky left-0 z-10 bg-card italic">Alíquota efetiva</TableCell>
                  {r.meses.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {formatarPercentual(-(r.totalPorMes[m] ?? 0), r.receitaPorMes[m] ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatarPercentual(-r.total, r.receitaTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Regime de caixa: o imposto conta no mês em que foi pago, não no mês de competência. Por isso a alíquota de um mês isolado oscila; a do período é a referência.
      </p>
    </>
  );
}
