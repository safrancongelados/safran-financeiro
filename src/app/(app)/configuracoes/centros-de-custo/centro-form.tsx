"use client";

import { useActionState } from "react";
import { salvarCentroAction, type ConfigFormState } from "@/actions/configuracoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Um centro de custo, editável ali mesmo. Sem `centro`, cria um novo. */
export function CentroForm({ centro }: { centro?: { id: string; nome: string; ativo: boolean } }) {
  const action = salvarCentroAction.bind(null, centro?.id ?? null);
  const [state, formAction, pendente] = useActionState<ConfigFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Input
        name="nome"
        defaultValue={centro?.nome}
        placeholder="ex.: Produção"
        required
        aria-label="Nome do centro de custo"
        className="h-9 min-w-44 flex-1"
      />
      {centro ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="ativo" defaultChecked={centro.ativo} className="size-4 accent-primary" />
          Ativo
        </label>
      ) : null}
      <Button type="submit" size="sm" variant={centro ? "secondary" : "primary"} disabled={pendente}>
        {pendente ? "Salvando…" : centro ? "Salvar" : "Criar centro"}
      </Button>
      {state.erro ? <p className="w-full text-xs text-destructive">{state.erro}</p> : null}
      {state.ok && !centro ? <p className="w-full text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
