"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { editarLinhaAction, soNestaAction } from "@/actions/categorias";
import type { GrupoOpcoes, OpcaoCentro } from "@/lib/opcoes";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 w-52 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

/** "Nome salvo nesta e em mais 3 linha(s) iguais." */
function aviso(feito: string, iguais: number | undefined) {
  return iguais ? `${feito} nesta e em mais ${iguais} linha(s) iguais.` : `${feito}. Vale também para as próximas iguais.`;
}

/**
 * Nome da linha, editável no clique. Mostra o nome de exibição (ou a
 * descrição do banco, que é o padrão) e, quando renomeada, o original
 * embaixo. Salvar vale para todas as linhas iguais, passadas e futuras.
 */
export function NomeEditavel({
  movimentacaoId,
  descricao,
  nomeExibicao,
}: {
  movimentacaoId: string;
  descricao: string;
  nomeExibicao: string | null;
}) {
  const atual = nomeExibicao ?? descricao;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(atual);
  const [salvando, startTransition] = useTransition();

  function salvar() {
    const novo = valor.trim();
    setEditando(false);
    if (novo === atual || (!novo && !nomeExibicao)) {
      setValor(atual);
      return;
    }
    startTransition(async () => {
      const r = await editarLinhaAction(movimentacaoId, { campo: "nome", valor: novo });
      if (r.erro) {
        setValor(atual);
        toast.error(r.erro);
        return;
      }
      toast.success(aviso("Nome salvo", r.iguais));
    });
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={valor}
        maxLength={80}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValor(atual);
            setEditando(false);
          }
        }}
        aria-label="Nome de exibição"
        placeholder="Vazio volta ao nome do banco"
        className="h-8 w-full rounded-md border border-ring bg-card px-2 text-sm outline-none ring-2 ring-ring/20"
      />
    );
  }

  return (
    <div className={cn(salvando && "opacity-60")}>
      <button
        type="button"
        onClick={() => {
          setValor(atual);
          setEditando(true);
        }}
        title="Editar o nome — vale para as linhas iguais"
        className="group flex items-start gap-1.5 text-left text-foreground"
      >
        <span>{salvando ? valor : atual}</span>
        <Pencil className="mt-1 size-3 shrink-0 text-muted-foreground opacity-40 group-hover:opacity-100" />
      </button>
      {nomeExibicao ? <p className="text-xs text-muted-foreground">{descricao}</p> : null}
    </div>
  );
}

/**
 * Categoria da linha. Trocar vale para todas as iguais; o aviso oferece
 * "Só nesta" para a exceção (fica como escolha manual, que regra não muda).
 */
export function CategoriaSelect({
  movimentacaoId,
  categoriaId,
  categoriaNome,
  origem,
  regraId,
  opcoes,
}: {
  movimentacaoId: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  origem: "regra" | "manual" | null;
  /** Regra que deu a categoria; o selo "auto" leva até ela. */
  regraId: string | null;
  opcoes: GrupoOpcoes[];
}) {
  const [valor, setValor] = useState(categoriaId ?? "");
  const [pendente, startTransition] = useTransition();
  const conhecida = !categoriaId || opcoes.some((g) => g.itens.some((i) => i.id === categoriaId));

  function mudar(novo: string) {
    const anterior = valor;
    setValor(novo);
    startTransition(async () => {
      const r = await editarLinhaAction(movimentacaoId, { campo: "categoria", valor: novo || null });
      if (r.erro) {
        setValor(anterior);
        toast.error(r.erro);
        return;
      }
      const desfazer = r.desfazer;
      toast.success(aviso("Categoria salva", r.iguais), {
        duration: 10000,
        action:
          r.iguais && desfazer
            ? {
                label: "Só nesta",
                onClick: async () => {
                  const s = await soNestaAction(movimentacaoId, novo || null, desfazer);
                  if (s.erro) toast.error(s.erro);
                  else toast.success("Categoria mudada só nesta linha; as iguais voltaram ao que eram.");
                },
              }
            : undefined,
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
        className={cn(SELECT, !valor && "border-warning/60 text-on-warning-soft")}
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
      {valor === (categoriaId ?? "") && origem === "regra" && regraId ? (
        <Link
          href={`/configuracoes/regras#regra-${regraId}`}
          title="Categorizada por regra — ver a regra"
          className="text-[10px] font-semibold uppercase text-muted-foreground underline-offset-2 hover:underline"
        >
          auto
        </Link>
      ) : null}
      {valor === (categoriaId ?? "") && origem === "manual" ? (
        <span title="Exceção: escolhida só para esta linha" className="text-[10px] font-semibold uppercase text-muted-foreground">
          só esta
        </span>
      ) : null}
    </div>
  );
}

/**
 * Centro de custo da linha. "Padrão" segue a categoria; escolher outro vira
 * exceção que vale para as iguais.
 */
export function CentroSelect({
  movimentacaoId,
  centroId,
  centroPadraoId,
  centros,
}: {
  movimentacaoId: string;
  centroId: string | null;
  /** Centro padrão da categoria da linha. */
  centroPadraoId: string | null;
  centros: OpcaoCentro[];
}) {
  // Igual ao padrão da categoria aparece como "padrão".
  const inicial = centroId && centroId !== centroPadraoId ? centroId : "";
  const [valor, setValor] = useState(inicial);
  const [pendente, startTransition] = useTransition();
  const nomePadrao = centros.find((c) => c.id === centroPadraoId)?.nome;

  if (centros.length === 0) return null;

  function mudar(novo: string) {
    const anterior = valor;
    setValor(novo);
    startTransition(async () => {
      const r = await editarLinhaAction(movimentacaoId, { campo: "centro", valor: novo || null });
      if (r.erro) {
        setValor(anterior);
        toast.error(r.erro);
        return;
      }
      toast.success(aviso("Centro de custo salvo", r.iguais));
    });
  }

  return (
    <select
      value={valor}
      disabled={pendente}
      onChange={(e) => mudar(e.target.value)}
      aria-label="Centro de custo"
      className={cn(SELECT, "mt-1 h-7 text-[11px] text-muted-foreground")}
    >
      <option value="">{nomePadrao ? `${nomePadrao} (padrão)` : "Sem centro (padrão)"}</option>
      {centros.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  );
}
