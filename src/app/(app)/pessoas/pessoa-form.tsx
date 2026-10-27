"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { salvarPessoaAction, type PessoaFormState } from "@/actions/pessoas";
import type { Pessoa } from "@/db/schema";
import { TIPO_PESSOA_LABEL, TIPOS_PESSOA } from "@/lib/pessoas";
import type { GrupoOpcoes } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

/**
 * Cria ou edita uma pessoa. Os padrões são o que o banco escreve no nome da
 * contraparte ou na descrição; é por eles (ou pelo CPF/CNPJ) que o sync
 * reconhece os lançamentos.
 */
export function PessoaForm({
  pessoa,
  inicial,
  categorias,
}: {
  pessoa?: Pessoa;
  /** Pré-preenchimento vindo do extrato ("+ pessoa" numa linha). */
  inicial?: { nome?: string; documento?: string; padrao?: string };
  categorias: GrupoOpcoes[];
}) {
  const router = useRouter();
  const [state, formAction, pendente] = useActionState<PessoaFormState, FormData>(salvarPessoaAction.bind(null, pessoa?.id ?? null), {});

  useEffect(() => {
    if (!state.ok) return;
    toast.success(state.ok);
    if (!pessoa && state.id) router.push(`/pessoas/${state.id}`);
  }, [state, pessoa, router]);

  const padroesIniciais = pessoa ? pessoa.padroes.join("\n") : (inicial?.padrao ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required maxLength={80} defaultValue={pessoa?.nome ?? inicial?.nome ?? ""} autoFocus={!pessoa} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select id="tipo" name="tipo" defaultValue={pessoa?.tipo ?? "funcionario"} className={SELECT}>
            {TIPOS_PESSOA.map((t) => (
              <option key={t} value={t}>
                {TIPO_PESSOA_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="documento">CPF ou CNPJ</Label>
          <Input id="documento" name="documento" inputMode="numeric" placeholder="só números" defaultValue={pessoa?.documento ?? inicial?.documento ?? ""} />
          <p className="text-xs text-muted-foreground">Quando o banco manda o documento completo, ele decide sozinho quem é.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoriaId">Categoria padrão</Label>
          <select id="categoriaId" name="categoriaId" defaultValue={pessoa?.categoriaId ?? ""} className={SELECT}>
            <option value="">Nenhuma (só o que as regras disserem)</option>
            {categorias.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.itens.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Todo lançamento dela sem regra cai aqui. Ex.: funcionário → Salários e encargos.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="padroes">Como o banco escreve o nome</Label>
          <textarea
            id="padroes"
            name="padroes"
            rows={3}
            defaultValue={padroesIniciais}
            placeholder={"um trecho por linha, ex.:\nmaria luisinha\nmaria l silva"}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
          <p className="text-xs text-muted-foreground">
            Sem acento e sem maiúsculas, não importa. Um lançamento é dela quando a contraparte ou a descrição contém um dos trechos.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="metaMensal">Meta mensal (R$)</Label>
          <Input
            id="metaMensal"
            name="metaMensal"
            inputMode="decimal"
            placeholder="ex.: 3500"
            defaultValue={pessoa?.metaMensalCentavos != null ? (pessoa.metaMensalCentavos / 100).toFixed(2).replace(".", ",") : ""}
          />
          <p className="text-xs text-muted-foreground">Pró-labore ou salário combinado. Acima disso, o sistema avisa.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas</Label>
          <Input id="notas" name="notas" maxLength={500} defaultValue={pessoa?.notas ?? ""} placeholder="ex.: cozinha, desde mar/2026" />
        </div>
        {pessoa ? (
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" name="ativa" defaultChecked={pessoa.ativa} className="accent-primary" />
            Ativa (desativada deixa de reconhecer lançamentos, mas o histórico fica)
          </label>
        ) : null}
      </div>
      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" loading={pendente}>
          {pessoa ? "Salvar" : "Cadastrar e reconhecer lançamentos"}
        </Button>
      </div>
    </form>
  );
}
