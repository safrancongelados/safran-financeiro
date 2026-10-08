"use client";

import { useActionState } from "react";
import { criarRegraManualAction, type CategoriaFormState } from "@/actions/categorias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

export function RegraForm({ grupos }: { grupos: { label: string; itens: { id: string; nome: string }[] }[] }) {
  const [state, formAction, pendente] = useActionState<CategoriaFormState, FormData>(criarRegraManualAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select name="campo" defaultValue="descricao" aria-label="Campo" className={SELECT}>
          <option value="descricao">Descrição contém</option>
          <option value="contraparte">Contraparte contém</option>
          <option value="documento">CPF/CNPJ é</option>
        </select>
        <Input name="padrao" required placeholder="ex.: pix recebido" aria-label="Texto" className="h-9 w-48" />
        <select name="sentido" defaultValue="entrada" aria-label="Sentido" className={SELECT}>
          <option value="entrada">nas entradas</option>
          <option value="saida">nas saídas</option>
          <option value="ambos">nas duas</option>
        </select>
        <span className="text-sm text-muted-foreground">→</span>
        <select name="categoriaId" required defaultValue="" aria-label="Categoria" className={SELECT}>
          <option value="" disabled>
            Categoria…
          </option>
          {grupos.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="nomeExibicao"
          maxLength={80}
          placeholder="Mostrar no extrato como… (opcional)"
          aria-label="Mostrar no extrato como"
          className="h-9 w-72"
        />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Criando…" : "Criar regra"}
        </Button>
      </div>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
      {state.ok ? <p className="text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
