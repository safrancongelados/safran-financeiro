"use client";

import { useActionState } from "react";
import { criarRegraManualAction, type RegraFormState } from "@/actions/categorias";
import type { GrupoOpcoes, OpcaoCentro } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

export function RegraForm({ grupos, centros }: { grupos: GrupoOpcoes[]; centros: OpcaoCentro[] }) {
  const [state, formAction, pendente] = useActionState<RegraFormState, FormData>(criarRegraManualAction, {});

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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">→</span>
        <select name="categoriaId" defaultValue="" aria-label="Categoria" className={SELECT}>
          <option value="">Categoria: não decide</option>
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
        <Input
          name="nomeExibicao"
          maxLength={80}
          placeholder="Mostrar no extrato como… (opcional)"
          aria-label="Mostrar no extrato como"
          className="h-9 w-64"
        />
        {centros.length > 0 ? (
          <select name="centroCustoId" defaultValue="" aria-label="Centro de custo" className={SELECT}>
            <option value="">Centro: padrão da categoria</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Criando…" : "Criar regra"}
        </Button>
      </div>
      {state.erro ? <p className="text-xs text-destructive">{state.erro}</p> : null}
      {state.ok ? <p className="text-xs text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
