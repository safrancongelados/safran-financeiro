"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { deslocarMes, rotuloMes } from "@/lib/periodo";
import { hrefExtrato, semFiltros, temFiltro, type FiltroExtrato } from "@/lib/extrato-filtros";
import type { GrupoOpcoes, OpcaoCentro } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";

/**
 * A barra de filtros do extrato. Tudo vive na URL (dá para copiar o link e
 * voltar com o navegador); a barra só troca a URL quando algo muda.
 */
export function FiltrosExtrato({
  filtro,
  mesCorrente,
  meses,
  categorias,
  centros,
  contas,
}: {
  filtro: FiltroExtrato;
  mesCorrente: string;
  /** Meses com movimento, do mais novo ao mais antigo. */
  meses: string[];
  categorias: GrupoOpcoes[];
  centros: OpcaoCentro[];
  contas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [q, setQ] = useState(filtro.q ?? "");
  const busca = useRef<HTMLInputElement>(null);
  // O filtro em vigor: o que já foi pedido, mesmo que a URL ainda não tenha
  // voltado do servidor. Assim duas mudanças seguidas se somam, em vez de a
  // segunda partir de um filtro velho e desfazer a primeira.
  const emVigor = useRef<FiltroExtrato>(filtro);
  const ultimoQ = useRef(filtro.q ?? "");

  function navegar(novo: FiltroExtrato) {
    emVigor.current = novo;
    ultimoQ.current = novo.q ?? "";
    startTransition(() => router.replace(hrefExtrato(novo), { scroll: false }));
  }

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const termo = q.trim();
    if (termo === ultimoQ.current) return;
    const t = setTimeout(() => navegar({ ...emVigor.current, q: termo || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // A URL voltou do servidor (ou mudou por um link, ou pelo "voltar" do
  // navegador): ela é a verdade. O campo de busca só acompanha quando a
  // mudança veio de fora, para não apagar o que ainda está sendo digitado.
  useEffect(() => {
    emVigor.current = filtro;
    const daUrl = filtro.q ?? "";
    if (daUrl !== ultimoQ.current) {
      ultimoQ.current = daUrl;
      setQ(daUrl);
    }
  }, [filtro]);

  // "/" leva ao campo de busca, como em muitos sistemas.
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== "/" || alvo?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      busca.current?.focus();
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  const opcoesMes = meses.includes(filtro.mes) ? meses : [filtro.mes, ...meses].sort().reverse();
  const limpar = temFiltro(filtro) || q.trim();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mês anterior"
          className="size-9 text-muted-foreground"
          onClick={() => navegar({ ...emVigor.current, mes: deslocarMes(emVigor.current.mes, -1) })}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <select
          value={filtro.mes}
          onChange={(e) => navegar({ ...emVigor.current, mes: e.target.value })}
          aria-label="Mês"
          className={cn(SELECT, "min-w-40 font-medium")}
        >
          {opcoesMes.map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Próximo mês"
          className="size-9 text-muted-foreground"
          disabled={filtro.mes >= mesCorrente}
          onClick={() => navegar({ ...emVigor.current, mes: deslocarMes(emVigor.current.mes, 1) })}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={busca}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          maxLength={80}
          placeholder="Buscar nome, contraparte ou CNPJ"
          title="Busca na descrição, no nome, na contraparte e no CPF/CNPJ. Atalho: /"
          aria-label="Buscar no extrato"
          className={cn(SELECT, "w-full pr-8 pl-8")}
        />
        {pendente ? (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Limpar busca"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <select
        value={filtro.tipo ?? ""}
        onChange={(e) => navegar({ ...emVigor.current, tipo: (e.target.value || undefined) as FiltroExtrato["tipo"] })}
        aria-label="Entradas ou saídas"
        className={cn(SELECT, filtro.tipo && "border-primary text-on-primary-soft")}
      >
        <option value="">Entradas e saídas</option>
        <option value="entrada">Só entradas</option>
        <option value="saida">Só saídas</option>
      </select>

      <select
        value={filtro.categoria ?? ""}
        onChange={(e) => navegar({ ...emVigor.current, categoria: e.target.value || undefined })}
        aria-label="Categoria"
        className={cn(SELECT, "max-w-56", filtro.categoria && "border-primary text-on-primary-soft")}
      >
        <option value="">Todas as categorias</option>
        <option value="sem">Sem categoria</option>
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

      {centros.length > 0 ? (
        <select
          value={filtro.centro ?? ""}
          onChange={(e) => navegar({ ...emVigor.current, centro: e.target.value || undefined })}
          aria-label="Centro de custo"
          className={cn(SELECT, filtro.centro && "border-primary text-on-primary-soft")}
        >
          <option value="">Todos os centros</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
          <option value="sem">Sem centro</option>
        </select>
      ) : null}

      {contas.length > 1 ? (
        <select
          value={filtro.conta ?? ""}
          onChange={(e) => navegar({ ...emVigor.current, conta: e.target.value || undefined })}
          aria-label="Conta"
          className={cn(SELECT, filtro.conta && "border-primary text-on-primary-soft")}
        >
          <option value="">Todas as contas</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      ) : null}

      {limpar ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setQ("");
            navegar(semFiltros(emVigor.current));
          }}
        >
          <X className="size-3.5" /> Limpar
        </Button>
      ) : null}
    </div>
  );
}
