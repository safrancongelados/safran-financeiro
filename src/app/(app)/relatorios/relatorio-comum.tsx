import Link from "next/link";
import { Download } from "lucide-react";
import { mesesComMovimento } from "@/db/queries/financeiro";
import { paramsDoPeriodo, type Periodo } from "@/lib/periodo";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/seletor-periodo";

/** A barra de cima de cada relatório: período e exportação. */
export async function BarraRelatorio({ tipo, periodo, hoje }: { tipo: string; periodo: Periodo; hoje: string }) {
  const meses = await mesesComMovimento();
  const anos = [...new Set([Number(hoje.slice(0, 4)), ...meses.map((m) => Number(m.slice(0, 4)))])].sort((a, b) => b - a);
  const exportar = `/api/relatorios/${tipo}?${new URLSearchParams(paramsDoPeriodo(periodo))}`;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <SeletorPeriodo base={`/relatorios/${tipo}`} periodo={periodo} anos={anos} />
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <a href={exportar} title="Baixar este relatório em CSV (abre no Excel)">
          <Download className="size-4" /> CSV
        </a>
      </Button>
    </div>
  );
}

/** Variação em fração como "+12%" ou "−8%", colorida: custo subindo é aviso. */
export function Variacao({ v, invertida = true }: { v: number | null; invertida?: boolean }) {
  if (v === null) return <span className="text-muted-foreground/50">—</span>;
  const pct = Math.round(v * 100);
  const ruim = invertida ? pct > 0 : pct < 0;
  return (
    <span className={ruim ? "text-on-warning-soft" : pct === 0 ? "text-muted-foreground" : "text-on-success-soft"}>
      {pct > 0 ? "+" : pct < 0 ? "−" : ""}
      {Math.abs(pct)}%
    </span>
  );
}

export function LinkPessoa({ id, nome }: { id: string | null; nome: string }) {
  return id ? (
    <Link href={`/pessoas/${id}`} className="underline-offset-2 hover:underline">
      {nome}
    </Link>
  ) : (
    <span>{nome}</span>
  );
}
