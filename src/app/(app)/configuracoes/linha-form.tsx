"use client";

import { useActionState, useState } from "react";
import { salvarLinhaAction, type ConfigFormState } from "@/actions/configuracoes";
import type { SecaoDre, TipoLinhaDre } from "@/db/schema";
import { SECAO_LABEL } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

/** Uma linha da DRE, editável ali mesmo. Sem `linha`, cria uma nova (no fim). */
export function LinhaForm({
  linha,
}: {
  linha?: {
    id: string;
    nome: string;
    tipo: TipoLinhaDre;
    secao: SecaoDre;
    basePercentual: boolean;
    mostrarPercentual: boolean;
  };
}) {
  const action = salvarLinhaAction.bind(null, linha?.id ?? null);
  const [state, formAction, pendente] = useActionState<ConfigFormState, FormData>(action, {});
  const [tipo, setTipo] = useState<TipoLinhaDre>(linha?.tipo ?? "grupo");
  const subtotal = tipo === "subtotal";

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {linha ? null : (
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoLinhaDre)}
          aria-label="Tipo da linha"
          className={SELECT}
        >
          <option value="grupo">Grupo (soma categorias)</option>
          <option value="subtotal">Subtotal (= soma de tudo acima)</option>
        </select>
      )}
      <Input
        name="nome"
        defaultValue={linha?.nome}
        placeholder={subtotal ? "ex.: Margem de contribuição" : "ex.: Despesas com pessoal"}
        required
        aria-label="Nome da linha"
        className="h-9 min-w-44 flex-1 font-medium"
      />
      {subtotal ? (
        <input type="hidden" name="secao" value="dre" />
      ) : (
        <select name="secao" defaultValue={linha?.secao ?? "dre"} aria-label="Seção" className={SELECT}>
          {(Object.keys(SECAO_LABEL) as SecaoDre[]).map((s) => (
            <option key={s} value={s}>
              {SECAO_LABEL[s]}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Esta linha é o 100% dos percentuais">
        <input type="checkbox" name="basePercentual" defaultChecked={linha?.basePercentual} className="size-4 accent-primary" />
        base do %
      </label>
      {subtotal ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Mostra, embaixo, quanto é da linha base">
          <input
            type="checkbox"
            name="mostrarPercentual"
            defaultChecked={linha?.mostrarPercentual}
            className="size-4 accent-primary"
          />
          mostrar %
        </label>
      ) : null}
      <Button type="submit" size="sm" variant={linha ? "secondary" : "primary"} disabled={pendente}>
        {pendente ? "Salvando…" : linha ? "Salvar" : "Criar linha"}
      </Button>
      {state.erro ? <p className="w-full text-xs text-destructive">{state.erro}</p> : null}
      {state.ok && !linha ? <p className="w-full text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
