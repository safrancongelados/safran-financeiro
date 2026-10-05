import Link from "next/link";
import type { Serie } from "@/lib/dre";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { rotuloMesCurto } from "@/lib/periodo";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type LinhaTabela =
  | { tipo: "secao"; label: string }
  | {
      tipo: "grupo" | "categoria" | "subtotal" | "destaque" | "alerta";
      label: string;
      serie: Serie;
      /** Para onde cada célula leva (o extrato filtrado), quando faz sentido. */
      href?: (mes: string) => string;
    }
  | { tipo: "percentual"; label: string; parte: Serie; base: Serie }
  | { tipo: "saldo"; label: string; porMes: Record<string, number | null>; total?: number | null };

function Valor({ centavos, forte }: { centavos: number; forte?: boolean }) {
  if (centavos === 0) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className={cn(centavos < 0 && forte ? "text-destructive" : undefined)}>{formatarCentavos(centavos)}</span>
  );
}

/**
 * Tabela mês a mês da DRE e do fluxo de caixa. O rótulo fica preso à esquerda
 * para a tabela rolar de lado no celular sem perder a linha.
 */
export function TabelaMensal({ meses, linhas, comTotal = true }: { meses: string[]; linhas: LinhaTabela[]; comTotal?: boolean }) {
  const colunas = meses.length + (comTotal ? 2 : 1);

  return (
    <Card className="overflow-hidden py-0">
      <div className="relative w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 bg-secondary px-4 py-2.5 text-left font-semibold">&nbsp;</th>
              {meses.map((m) => (
                <th key={m} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                  {rotuloMesCurto(m)}
                </th>
              ))}
              {comTotal ? <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Total</th> : null}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => {
              if (linha.tipo === "secao") {
                return (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={colunas} className="sticky left-0 px-4 pt-5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {linha.label}
                    </td>
                  </tr>
                );
              }

              if (linha.tipo === "percentual") {
                return (
                  <tr key={i} className="border-b border-border text-xs text-muted-foreground">
                    <td className="sticky left-0 min-w-36 max-w-44 sm:max-w-none sm:whitespace-nowrap bg-card px-4 py-1.5 pl-8 italic">{linha.label}</td>
                    {meses.map((m) => (
                      <td key={m} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {formatarPercentual(linha.parte.porMes[m] ?? 0, linha.base.porMes[m] ?? 0)}
                      </td>
                    ))}
                    {comTotal ? (
                      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
                        {formatarPercentual(linha.parte.total, linha.base.total)}
                      </td>
                    ) : null}
                  </tr>
                );
              }

              if (linha.tipo === "saldo") {
                return (
                  <tr key={i} className="border-b border-border bg-secondary/40 font-semibold">
                    <td className="sticky left-0 min-w-36 max-w-44 sm:max-w-none sm:whitespace-nowrap bg-secondary px-4 py-2.5">{linha.label}</td>
                    {meses.map((m) => (
                      <td key={m} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {linha.porMes[m] === null || linha.porMes[m] === undefined ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <Valor centavos={linha.porMes[m]!} forte />
                        )}
                      </td>
                    ))}
                    {comTotal ? (
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        {linha.total === null || linha.total === undefined ? null : <Valor centavos={linha.total} forte />}
                      </td>
                    ) : null}
                  </tr>
                );
              }

              // Custo é negativo por natureza; vermelho só quando um resultado fica negativo.
              const forte = linha.tipo === "subtotal" || linha.tipo === "destaque";
              const estilo = {
                grupo: "font-semibold",
                categoria: "text-muted-foreground",
                subtotal: "bg-secondary/40 font-semibold",
                destaque: "bg-primary-soft font-bold text-on-primary-soft",
                alerta: "bg-warning-soft text-on-warning-soft",
              }[linha.tipo];
              const fundoRotulo = {
                grupo: "bg-card",
                categoria: "bg-card",
                subtotal: "bg-secondary",
                destaque: "bg-primary-soft",
                alerta: "bg-warning-soft",
              }[linha.tipo];

              return (
                <tr key={i} className={cn("border-b border-border", estilo)}>
                  <td className={cn("sticky left-0 min-w-36 max-w-44 sm:max-w-none sm:whitespace-nowrap px-4 py-2", fundoRotulo, linha.tipo === "categoria" && "pl-8")}>
                    {linha.label}
                  </td>
                  {meses.map((m) => {
                    const v = linha.serie.porMes[m] ?? 0;
                    return (
                      <td key={m} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {linha.href && v !== 0 ? (
                          <Link href={linha.href(m)} className="hover:underline">
                            <Valor centavos={v} forte={forte} />
                          </Link>
                        ) : (
                          <Valor centavos={v} forte={forte} />
                        )}
                      </td>
                    );
                  })}
                  {comTotal ? (
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      <Valor centavos={linha.serie.total} forte={forte} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
