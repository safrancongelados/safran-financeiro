"use client";

import { useActionState } from "react";
import { conectarBancoAction, type ConectarBancoState } from "@/actions/extrato";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: ConectarBancoState = {};

export function ConectarBancoForm() {
  const [state, formAction, pendente] = useActionState(conectarBancoAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="itemId">ID do item no Meu Pluggy</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="itemId"
          name="itemId"
          required
          placeholder="00000000-0000-0000-0000-000000000000"
          autoComplete="off"
          spellCheck={false}
          className="font-mono sm:max-w-sm"
        />
        <Button type="submit" disabled={pendente}>
          {pendente ? "Conectando…" : "Conectar e puxar extrato"}
        </Button>
      </div>
      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      {state.ok ? <p className="text-sm text-on-success-soft">{state.ok}</p> : null}
    </form>
  );
}
