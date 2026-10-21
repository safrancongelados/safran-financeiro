"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarMapeamentoAction } from "@/actions/cardapio-web";
import type { GrupoOpcoes } from "@/lib/opcoes";

const SELECT =
  "h-8 w-full max-w-72 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

/** Em que categoria da DRE uma categoria do cardápio vende. Salva ao trocar. */
export function MapeamentoSelect({
  id,
  categoriaId,
  opcoes,
  padraoNome,
}: {
  id: string;
  categoriaId: string | null;
  opcoes: GrupoOpcoes[];
  /** Nome da categoria rateada padrão, para a opção "sem destino". */
  padraoNome: string | null;
}) {
  const [valor, setValor] = useState(categoriaId ?? "");
  const [salvando, startTransition] = useTransition();

  return (
    <select
      value={valor}
      disabled={salvando}
      aria-label="Categoria da DRE"
      className={SELECT}
      onChange={(e) => {
        const novo = e.target.value;
        const anterior = valor;
        setValor(novo);
        startTransition(async () => {
          const r = await salvarMapeamentoAction(id, novo || null);
          if (r.erro) {
            toast.error(r.erro);
            setValor(anterior);
          } else {
            toast.success("Mapeamento salvo. A DRE já reflete.");
          }
        });
      }}
    >
      <option value="">{padraoNome ? `Padrão (${padraoNome})` : "Sem destino"}</option>
      {opcoes.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.itens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
