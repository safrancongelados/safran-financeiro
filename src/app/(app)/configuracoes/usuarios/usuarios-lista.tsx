"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { atualizarUsuarioAction, redefinirSenhaAction } from "@/actions/usuarios";
import type { PapelUsuario } from "@/db/schema";
import { PAPEL_LABEL } from "@/lib/papeis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  criadoEm: string;
}

const SELECT =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

export function UsuariosLista({ usuarios, meuId }: { usuarios: Usuario[]; meuId: string }) {
  const [pendente, startTransition] = useTransition();
  const [senhas, setSenhas] = useState<Record<string, string>>({});

  function mudar(id: string, dados: { papel?: string; ativo?: boolean }) {
    startTransition(async () => {
      const r = await atualizarUsuarioAction(id, dados);
      if (r.erro) toast.error(r.erro);
      else toast.success("Acesso atualizado.");
    });
  }

  function redefinir(u: Usuario) {
    if (!window.confirm(`Gerar uma nova senha provisória para ${u.nome}? A atual deixa de valer.`)) return;
    startTransition(async () => {
      const r = await redefinirSenhaAction(u.id);
      if (r.erro || !r.senha) toast.error(r.erro ?? "Não foi possível redefinir.");
      else setSenhas((s) => ({ ...s, [u.id]: r.senha! }));
    });
  }

  return (
    <Card className="overflow-hidden py-0">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id} className={cn(!u.ativo && "opacity-60")}>
              <TableCell>
                <span className="font-medium text-foreground">{u.nome}</span>
                {u.id === meuId ? <Badge variant="secondary" className="ml-2">você</Badge> : null}
                {senhas[u.id] ? (
                  <span className="mt-1 block text-xs text-on-success-soft">
                    Senha provisória: <span className="font-mono font-semibold">{senhas[u.id]}</span>
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <select
                  value={u.papel}
                  disabled={pendente || u.id === meuId}
                  onChange={(e) => mudar(u.id, { papel: e.target.value })}
                  aria-label="Papel"
                  className={SELECT}
                >
                  {(Object.keys(PAPEL_LABEL) as PapelUsuario[]).map((p) => (
                    <option key={p} value={p}>
                      {PAPEL_LABEL[p]}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={u.ativo} disabled={pendente || u.id === meuId} onChange={(e) => mudar(u.id, { ativo: e.target.checked })} className="accent-primary" />
                  {u.ativo ? "ativo" : "desativado"}
                </label>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={pendente} onClick={() => redefinir(u)}>
                  <KeyRound className="size-3.5" /> Nova senha
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
