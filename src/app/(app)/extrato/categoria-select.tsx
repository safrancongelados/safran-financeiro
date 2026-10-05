"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { categorizarAction, criarRegraAction } from "@/actions/categorias";
import { cn } from "@/lib/utils";

export interface GrupoOpcoes {
  label: string;
  itens: { id: string; nome: string }[];
}

function encurtar(texto: string, max = 28) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * Seletor de categoria de uma linha do extrato. Depois de escolher, oferece
 * transformar a escolha em regra para a mesma contraparte — é o que faz o
 * extrato do mês seguinte já chegar categorizado.
 */
export function CategoriaSelect({
  movimentacaoId,
  categoriaId,
  categoriaNome,
  automatica,
  opcoes,
}: {
  movimentacaoId: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  automatica: boolean;
  opcoes: GrupoOpcoes[];
}) {
  const [valor, setValor] = useState(categoriaId ?? "");
  const [pendente, startTransition] = useTransition();
  const conhecida = !categoriaId || opcoes.some((g) => g.itens.some((i) => i.id === categoriaId));

  function mudar(novo: string) {
    const anterior = valor;
    setValor(novo);
    startTransition(async () => {
      const r = await categorizarAction(movimentacaoId, novo || null);
      if (r.erro) {
        setValor(anterior);
        toast.error(r.erro);
        return;
      }
      if (!novo || !r.sugestao) return;

      const quem = encurtar(r.sugestao.rotulo);
      toast.success("Categoria salva.", {
        duration: 10000,
        action: {
          label: r.sugestao.outras > 0 ? `Aplicar a mais ${r.sugestao.outras} de ${quem}` : `Usar sempre para ${quem}`,
          onClick: async () => {
            const regra = await criarRegraAction(movimentacaoId, novo);
            if (regra.erro) toast.error(regra.erro);
            else toast.success(`Regra criada. ${regra.alteradas ?? 0} movimentação(ões) atualizada(s).`);
          },
        },
      });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={valor}
        disabled={pendente}
        onChange={(e) => mudar(e.target.value)}
        aria-label="Categoria"
        className={cn(
          "h-8 w-52 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60",
          !valor && "border-warning/60 text-on-warning-soft"
        )}
      >
        <option value="">Sem categoria</option>
        {!conhecida && categoriaId ? <option value={categoriaId}>{categoriaNome} (inativa)</option> : null}
        {opcoes.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {automatica && valor === categoriaId ? (
        <span title="Categorizada por regra" className="text-[10px] font-semibold uppercase text-muted-foreground">
          auto
        </span>
      ) : null}
    </div>
  );
}
