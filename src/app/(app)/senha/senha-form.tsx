"use client";

import { useActionState } from "react";
import { trocarSenhaAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SenhaForm() {
  const [state, formAction, pendente] = useActionState<FormState, FormData>(trocarSenhaAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="atual">Senha atual</Label>
        <Input id="atual" name="atual" type="password" required autoComplete="current-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nova">Nova senha</Label>
        <Input id="nova" name="nova" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      {state.ok ? <p className="text-sm text-on-success-soft">{state.ok}</p> : null}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
