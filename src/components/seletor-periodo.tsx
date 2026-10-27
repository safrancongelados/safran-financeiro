import { paramsDoPeriodo, type Periodo } from "@/lib/periodo";
import { Chip, GrupoChips } from "@/components/chip";

/**
 * Período da DRE, do fluxo de caixa e dos relatórios: os últimos 3, 6 ou 12
 * meses ou um ano civil (os anos em que houve movimento, mais o corrente).
 */
export function SeletorPeriodo({
  base,
  periodo,
  anos,
  extra = {},
}: {
  base: string;
  periodo: Periodo;
  /** Anos com movimento, do mais novo ao mais antigo. */
  anos: number[];
  /** Outros parâmetros que a tela mantém ao trocar o período (ex.: centro). */
  extra?: Record<string, string | undefined>;
}) {
  const href = (p: Periodo) => {
    const params = new URLSearchParams(paramsDoPeriodo(p));
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    return `${base}?${params}`;
  };
  return (
    <GrupoChips>
      {([3, 6, 12] as const).map((n) => (
        <Chip key={n} href={href({ tipo: "meses", n })} ativo={periodo.tipo === "meses" && periodo.n === n}>
          {n} meses
        </Chip>
      ))}
      {anos.map((ano) => (
        <Chip key={ano} href={href({ tipo: "ano", ano })} ativo={periodo.tipo === "ano" && periodo.ano === ano}>
          {ano}
        </Chip>
      ))}
    </GrupoChips>
  );
}
