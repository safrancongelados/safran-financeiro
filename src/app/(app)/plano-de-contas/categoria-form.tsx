"use client";

import { useActionState } from "react";
import { salvarCategoriaAction, type CategoriaFormState } from "@/actions/categorias";
import type { GrupoDre } from "@/db/schema";
import { GRUPOS } from "@/lib/grupos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

/** Uma linha do plano de contas, editável ali mesmo. Sem `categoria`, cria uma nova. */
export function CategoriaForm({
  categoria,
}: {
  categoria?: { id: string; nome: string; grupo: GrupoDre; ativa: boolean };
}) {
  const action = salvarCategoriaAction.bind(null, categoria?.id ?? null);
  const [state, formAction, pendente] = useActionState<CategoriaFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 py-1.5">
      <Input
        name="nome"
        defaultValue={categoria?.nome}
        placeholder="Nome da categoria"
        required
        aria-label="Nome"
        className="h-9 min-w-48 flex-1"
      />
      <select name="grupo" defaultValue={categoria?.grupo ?? ""} required aria-label="Grupo da DRE" className={SELECT}>
        <option value="" disabled>
          Grupo da DRE…
        </option>
        {GRUPOS.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </select>
      {categoria ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="ativa" defaultChecked={categoria.ativa} className="size-4 accent-primary" />
          Ativa
        </label>
      ) : null}
      <Button type="submit" size="sm" variant={categoria ? "secondary" : "primary"} disabled={pendente}>
        {pendente ? "Salvando…" : categoria ? "Salvar" : "Criar categoria"}
      </Button>
      {state.erro ? <p className="w-full text-xs text-destructive">{state.erro}</p> : null}
      {state.ok && !categoria ? <p className="w-full text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
