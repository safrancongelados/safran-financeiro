"use client";

import { useActionState } from "react";
import { criarUsuarioAction, type UsuarioFormState } from "@/actions/usuarios";
import { PAPEL_DESCRICAO, PAPEL_LABEL } from "@/lib/papeis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

export function NovoUsuarioForm() {
  const [state, formAction, pendente] = useActionState<UsuarioFormState, FormData>(criarUsuarioAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="papel">Papel</Label>
          <select id="papel" name="papel" defaultValue="financeiro" className={SELECT}>
            {(Object.keys(PAPEL_LABEL) as (keyof typeof PAPEL_LABEL)[]).map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]} — {PAPEL_DESCRICAO[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      {state.ok ? (
        <div className="rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-sm text-on-success-soft">
          <p>{state.ok}</p>
          <p className="mt-1">
            E-mail: <span className="font-mono">{state.email}</span> · Senha provisória: <span className="font-mono text-base font-semibold">{state.senha}</span>
          </p>
        </div>
      ) : null}
      <Button type="submit" loading={pendente}>
        Criar acesso
      </Button>
    </form>
  );
}
