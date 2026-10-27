"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MessageSquareText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { editarLinhaAction, editarObservacaoAction, preverEscoposAction, type Escopo, type OpcaoEscopo } from "@/actions/categorias";
import type { GrupoOpcoes, OpcaoCentro } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
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

export type OrigemCategoria = "regra" | "manual" | "pessoa" | "estorno" | null;

const SELO: Record<Exclude<OrigemCategoria, null>, { texto: string; titulo: string }> = {
  regra: { texto: "auto", titulo: "Categorizada por regra — ver a regra" },
  manual: { texto: "só esta", titulo: "Exceção: escolhida só para esta linha" },
  pessoa: { texto: "pessoa", titulo: "Veio da categoria padrão da pessoa cadastrada" },
  estorno: { texto: "estorno", titulo: "Estorno: herdou a categoria do lançamento que devolveu, para os dois se anularem na DRE" },
};

/** O selo que diz de onde veio a categoria. */
export function SeloOrigem({ origem, regraId }: { origem: OrigemCategoria; regraId: string | null }) {
  if (!origem) return null;
  const s = SELO[origem];
  const classe = "text-[10px] font-semibold uppercase text-muted-foreground";
  if (origem === "regra" && regraId) {
    return (
      <Link href={`/configuracoes/regras#regra-${regraId}`} title={s.titulo} className={cn(classe, "underline-offset-2 hover:underline")}>
        {s.texto}
      </Link>
    );
  }
  return (
    <span title={s.titulo} className={classe}>
      {s.texto}
    </span>
  );
}

/**
 * Categoria da linha. Ao escolher outra, antes de gravar pergunta o
 * alcance: todas as linhas com o mesmo CPF/CNPJ, com a mesma contraparte,
 * com a mesma descrição (com a contagem de cada uma) ou só esta.
 */
export function CategoriaSelect({
  movimentacaoId,
  categoriaId,
  categoriaNome,
  origem,
  regraId,
  opcoes,
  permitirSoNesta = true,
}: {
  movimentacaoId: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  origem: OrigemCategoria;
  /** Regra que deu a categoria; o selo "auto" leva até ela. */
  regraId: string | null;
  opcoes: GrupoOpcoes[];
  /** Na visão por nome a linha representa o grupo inteiro: "só esta" não faz sentido ali. */
  permitirSoNesta?: boolean;
}) {
  const [valor, setValor] = useState(categoriaId ?? "");
  const [pendente, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState<{ novo: string; opcoes: OpcaoEscopo[]; escopo: Escopo } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const conhecida = !categoriaId || opcoes.some((g) => g.itens.some((i) => i.id === categoriaId));
  const nomeDe = (id: string) => opcoes.flatMap((g) => g.itens).find((i) => i.id === id)?.nome ?? "Sem categoria";

  // Clique fora fecha o diálogo sem gravar.
  useEffect(() => {
    if (!dialogo) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setDialogo(null);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setDialogo(null);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [dialogo]);

  async function escolher(novo: string) {
    if (novo === (categoriaId ?? "")) return;
    setCarregando(true);
    const r = await preverEscoposAction(movimentacaoId);
    setCarregando(false);
    if (r.erro || !r.opcoes) {
      toast.error(r.erro ?? "Não foi possível preparar a mudança.");
      return;
    }
    const opcoesEscopo = permitirSoNesta ? r.opcoes : r.opcoes.filter((o) => o.escopo !== "so_esta");
    // Sem nenhuma identidade, só resta "só esta": grava direto.
    if (opcoesEscopo.length === 1 && opcoesEscopo[0].escopo === "so_esta") {
      aplicar(novo, "so_esta");
      return;
    }
    setDialogo({ novo, opcoes: opcoesEscopo, escopo: opcoesEscopo[0].escopo });
  }

  function aplicar(novo: string, escopo: Escopo) {
    const anterior = valor;
    setDialogo(null);
    setValor(novo);
    startTransition(async () => {
      const r = await editarLinhaAction(movimentacaoId, { campo: "categoria", valor: novo || null }, escopo);
      if (r.erro) {
        setValor(anterior);
        toast.error(r.erro);
        return;
      }
      toast.success(
        escopo === "so_esta"
          ? `Categoria "${nomeDe(novo)}" salva só nesta linha.`
          : aviso(`Categoria "${nomeDe(novo)}" salva`, r.iguais)
      );
    });
  }

  return (
    <div ref={caixa} className="relative flex items-center gap-1.5">
      <select
        value={dialogo ? dialogo.novo : valor}
        disabled={pendente || carregando}
        onChange={(e) => escolher(e.target.value)}
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
      {carregando || pendente ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      {!dialogo && !pendente && valor === (categoriaId ?? "") ? <SeloOrigem origem={origem} regraId={regraId} /> : null}

      {dialogo ? (
        <div
          role="dialog"
          aria-label="Onde aplicar a categoria"
          className="absolute top-full left-0 z-40 mt-1 w-80 rounded-lg border border-border bg-card p-3 text-left shadow-elevation-2"
        >
          <p className="text-sm font-medium text-foreground">
            Aplicar <span className="text-on-primary-soft">{nomeDe(dialogo.novo)}</span> a:
          </p>
          <div className="mt-2 space-y-1.5">
            {dialogo.opcoes.map((o) => (
              <label key={o.escopo} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-secondary">
                <input
                  type="radio"
                  name={`escopo-${movimentacaoId}`}
                  checked={dialogo.escopo === o.escopo}
                  onChange={() => setDialogo({ ...dialogo, escopo: o.escopo })}
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-foreground">
                    {o.escopo === "so_esta" ? "Só esta linha" : `Todas com ${o.rotulo}`}
                  </span>
                  <span className="block text-muted-foreground">
                    {o.escopo === "so_esta"
                      ? "Exceção manual: regra nenhuma muda."
                      : o.iguais > 0
                        ? `Esta e mais ${o.iguais} linha(s), passadas e futuras.`
                        : "Só esta por enquanto; vale para as próximas iguais."}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={() => aplicar(dialogo.novo, dialogo.escopo)}>
              Aplicar
            </Button>
          </div>
        </div>
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

/** Anotação livre da linha: um ícone que abre o campo; vazio apaga. */
export function Observacao({ movimentacaoId, texto }: { movimentacaoId: string; texto: string | null }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto ?? "");
  const [salvando, startTransition] = useTransition();

  function salvar() {
    setEditando(false);
    const novo = valor.trim();
    if (novo === (texto ?? "")) return;
    startTransition(async () => {
      const r = await editarObservacaoAction(movimentacaoId, novo);
      if (r.erro) toast.error(r.erro);
      else toast.success(novo ? "Anotação salva." : "Anotação apagada.");
    });
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={valor}
        maxLength={200}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValor(texto ?? "");
            setEditando(false);
          }
        }}
        aria-label="Anotação"
        placeholder="Anotação (ex.: adiantamento de férias)"
        className="mt-1 h-7 w-full rounded-md border border-ring bg-card px-2 text-xs outline-none ring-2 ring-ring/20"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title={texto ? "Editar anotação" : "Anotar"}
      className={cn(
        "mt-0.5 inline-flex max-w-full items-center gap-1 text-left text-xs",
        texto ? "text-on-primary-soft" : "text-muted-foreground opacity-50 hover:opacity-100",
        salvando && "opacity-60"
      )}
    >
      <MessageSquareText className="size-3 shrink-0" />
      {texto ? <span className="truncate">{texto}</span> : null}
    </button>
  );
}
