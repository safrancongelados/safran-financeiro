"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { CheckSquare, Square, Users, X } from "lucide-react";
import { toast } from "sonner";
import { categorizarEmLoteAction } from "@/actions/categorias";
import { vincularPessoaAction } from "@/actions/pessoas";
import type { GrupoOpcoes } from "@/lib/opcoes";
import { formatarCentavos } from "@/lib/dinheiro";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Selecao {
  ids: Set<string>;
  alternar: (id: string) => void;
  marcarTodas: (ids: string[]) => void;
  limpar: () => void;
}

const Contexto = createContext<Selecao | null>(null);

/**
 * Seleção de linhas do extrato para agir em lote. O estado mora aqui, no
 * cliente; as linhas (renderizadas no servidor) só pedem a caixa de marcação.
 */
export function SelecaoProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const valor = useMemo<Selecao>(
    () => ({
      ids,
      alternar: (id) =>
        setIds((atual) => {
          const novo = new Set(atual);
          if (novo.has(id)) novo.delete(id);
          else novo.add(id);
          return novo;
        }),
      marcarTodas: (todas) => setIds((atual) => (todas.every((id) => atual.has(id)) ? new Set() : new Set(todas))),
      limpar: () => setIds(new Set()),
    }),
    [ids]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useSelecao(): Selecao {
  const s = useContext(Contexto);
  if (!s) throw new Error("useSelecao fora de SelecaoProvider");
  return s;
}

export function CaixaLinha({ id }: { id: string }) {
  const { ids, alternar } = useSelecao();
  const marcada = ids.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={marcada ? "Desmarcar linha" : "Marcar linha"}
      onClick={() => alternar(id)}
      className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", marcada && "text-primary")}
    >
      {marcada ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
    </button>
  );
}

export function CaixaTodas({ ids }: { ids: string[] }) {
  const sel = useSelecao();
  const todas = ids.length > 0 && ids.every((id) => sel.ids.has(id));
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={todas}
      aria-label={todas ? "Desmarcar todas" : "Marcar todas da tela"}
      title={todas ? "Desmarcar todas" : "Marcar todas da tela"}
      onClick={() => sel.marcarTodas(ids)}
      className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", todas && "text-primary")}
    >
      {todas ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
    </button>
  );
}

const SELECT =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

/**
 * A barra que aparece embaixo quando há linhas marcadas: categoria para
 * todas (como escolha manual de cada uma) ou vínculo a uma pessoa.
 */
export function BarraSelecao({
  valores,
  opcoes,
  pessoas,
}: {
  /** Valor de cada linha da tela, para somar a seleção. */
  valores: Record<string, number>;
  opcoes: GrupoOpcoes[];
  pessoas: { id: string; nome: string }[];
}) {
  const sel = useSelecao();
  const [pendente, startTransition] = useTransition();
  const [categoria, setCategoria] = useState("");
  const [pessoa, setPessoa] = useState("");
  if (sel.ids.size === 0) return null;

  const ids = [...sel.ids];
  const total = ids.reduce((acc, id) => acc + (valores[id] ?? 0), 0);

  function categorizar() {
    if (!categoria) return;
    startTransition(async () => {
      const r = await categorizarEmLoteAction(ids, categoria);
      if (r.erro) toast.error(r.erro);
      else {
        toast.success(`${r.alteradas} linha(s) categorizadas (só estas; regras não mudam).`);
        sel.limpar();
      }
    });
  }

  function vincular() {
    if (!pessoa) return;
    startTransition(async () => {
      const r = await vincularPessoaAction(ids, pessoa);
      if (r.erro) toast.error(r.erro);
      else {
        toast.success(`${r.pessoaNome} agora reconhece ${r.vinculados} lançamento(s), incluindo os futuros.`);
        sel.limpar();
      }
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-2.5 shadow-elevation-2 backdrop-blur md:left-60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {ids.length} selecionada(s) · {formatarCentavos(total)}
        </span>
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria para as selecionadas" className={SELECT}>
          <option value="">Categoria…</option>
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
        <Button type="button" size="sm" disabled={!categoria || pendente} onClick={categorizar}>
          Aplicar só nestas
        </Button>
        {pessoas.length > 0 ? (
          <>
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa para vincular" className={SELECT}>
              <option value="">Vincular a pessoa…</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="secondary" disabled={!pessoa || pendente} onClick={vincular}>
              <Users className="size-3.5" /> Vincular
            </Button>
          </>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={sel.limpar}>
          <X className="size-3.5" /> Limpar seleção
        </Button>
      </div>
    </div>
  );
}
