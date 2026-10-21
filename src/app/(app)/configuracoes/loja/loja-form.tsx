"use client";

import { useActionState } from "react";
import { salvarVendasPorProdutoAction, type ConfigFormState } from "@/actions/configuracoes";
import { Button } from "@/components/ui/button";

/** Cola o mix de vendas (mês; produto; valor; pedidos), uma linha por mês e produto. */
export function LojaForm() {
  const [state, formAction, pendente] = useActionState<ConfigFormState, FormData>(salvarVendasPorProdutoAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="csv"
        required
        rows={6}
        spellCheck={false}
        placeholder={"2026-10;marmitas;23471,10;79\n2026-10;porcoes;818,00;30\n2026-10;dietas;565,80;2\n2026-10;personal_chef;0;0"}
        aria-label="Mix de vendas"
        className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Gravando…" : "Gravar mix"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Formato: mês (AAAA-MM); produto (marmitas, porcoes, dietas, personal_chef); valor em reais; pedidos. Mês e
          produto já gravados são substituídos.
        </p>
      </div>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
      {state.ok ? <p className="text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
