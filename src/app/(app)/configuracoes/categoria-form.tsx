"use client";

import { useActionState } from "react";
import { salvarCategoriaAction, type ConfigFormState } from "@/actions/configuracoes";
import type { OpcaoCentro } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

/**
 * Uma categoria do plano de contas, editável ali mesmo: nome, em que linha da
 * DRE soma e o centro de custo padrão. Sem `categoria`, cria uma nova na
 * linha `linhaId`.
 */
export function CategoriaForm({
  categoria,
  linhaId,
  linhas,
  centros,
}: {
  categoria?: { id: string; nome: string; linhaId: string; centroCustoId: string | null; ativa: boolean };
  linhaId: string;
  /** Linhas de grupo, para mover a categoria. */
  linhas: { id: string; nome: string }[];
  centros: OpcaoCentro[];
}) {
  const action = salvarCategoriaAction.bind(null, categoria?.id ?? null);
  const [state, formAction, pendente] = useActionState<ConfigFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Input
        name="nome"
        defaultValue={categoria?.nome}
        placeholder="Nova categoria nesta linha"
        required
        aria-label="Nome da categoria"
        className="h-8 min-w-44 flex-1 text-sm"
      />
      {categoria ? (
        <select name="linhaId" defaultValue={categoria.linhaId} aria-label="Linha da DRE" className={SELECT}>
          {linhas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="linhaId" value={linhaId} />
      )}
      <select name="centroCustoId" defaultValue={categoria?.centroCustoId ?? ""} aria-label="Centro de custo padrão" className={SELECT}>
        <option value="">Sem centro</option>
        {centros.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      {categoria ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="ativa" defaultChecked={categoria.ativa} className="size-4 accent-primary" />
          Ativa
        </label>
      ) : null}
      <Button type="submit" size="sm" variant={categoria ? "ghost" : "secondary"} disabled={pendente}>
        {pendente ? "Salvando…" : categoria ? "Salvar" : "Adicionar"}
      </Button>
      {state.erro ? <p className="w-full text-xs text-destructive">{state.erro}</p> : null}
    </form>
  );
}
