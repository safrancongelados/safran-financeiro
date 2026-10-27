"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronLeft, ChevronRight, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { excluirVisaoAction, salvarVisaoAction } from "@/actions/visoes";
import { deslocarMes, rotuloMes } from "@/lib/periodo";
import {
  ePorMes,
  hrefExtrato,
  ORIGEM_LABEL,
  paramsExtrato,
  PERIODO_LABEL,
  semFiltros,
  temFiltro,
  type FiltroExtrato,
  type PeriodoRapido,
} from "@/lib/extrato-filtros";
import type { GrupoOpcoes, OpcaoCentro } from "@/lib/opcoes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SELECT =
  "h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20";
const CHIP = "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors";
const CHIP_ATIVO = "border-primary bg-primary-soft text-on-primary-soft";
const CHIP_INATIVO = "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground";

export interface VisaoSalvaItem {
  id: string;
  nome: string;
  params: string;
}

function reais(centavos: number): string {
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * A barra de filtros do extrato. Tudo vive na URL (dá para copiar o link e
 * voltar com o navegador); a barra só troca a URL quando algo muda.
 *
 * Primeira linha: o período (um mês com setas, um atalho ou um intervalo).
 * Segunda: busca e filtros. Terceira: o que está ativo, como chips, e as
 * visões salvas.
 */
export function FiltrosExtrato({
  filtro,
  hoje,
  meses,
  categorias,
  centros,
  contas,
  pessoas,
  visoes,
  podeEditar,
}: {
  filtro: FiltroExtrato;
  /** YYYY-MM-DD */
  hoje: string;
  /** Meses com movimento, do mais novo ao mais antigo. */
  meses: string[];
  categorias: GrupoOpcoes[];
  centros: OpcaoCentro[];
  contas: { id: string; nome: string }[];
  pessoas: { id: string; nome: string }[];
  visoes: VisaoSalvaItem[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [q, setQ] = useState(filtro.q ?? "");
  const [maisFiltros, setMaisFiltros] = useState(temFiltro(filtro) && Boolean(filtro.pessoa || filtro.min !== undefined || filtro.max !== undefined || filtro.origem));
  const [intervalo, setIntervalo] = useState(Boolean(filtro.de && filtro.ate));
  const busca = useRef<HTMLInputElement>(null);
  // O filtro em vigor: o que já foi pedido, mesmo que a URL ainda não tenha
  // voltado do servidor. Assim duas mudanças seguidas se somam, em vez de a
  // segunda partir de um filtro velho e desfazer a primeira.
  const emVigor = useRef<FiltroExtrato>(filtro);
  const ultimoQ = useRef(filtro.q ?? "");
  const mesCorrente = hoje.slice(0, 7);

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

  // "/" leva ao campo de busca; "[" e "]" andam um mês, como em muitos sistemas.
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        busca.current?.focus();
      } else if ((e.key === "[" || e.key === "]") && ePorMes(emVigor.current)) {
        const delta = e.key === "[" ? -1 : 1;
        const mes = deslocarMes(emVigor.current.mes, delta);
        if (mes <= mesCorrente) navegar({ ...emVigor.current, mes });
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesCorrente]);

  const porMes = ePorMes(filtro);
  const opcoesMes = meses.includes(filtro.mes) ? meses : [filtro.mes, ...meses].sort().reverse();
  const limpar = temFiltro(filtro) || q.trim();

  function periodoRapido(p: PeriodoRapido | undefined) {
    setIntervalo(false);
    navegar({ ...emVigor.current, periodo: p, de: undefined, ate: undefined });
  }

  function salvarVisao() {
    const nome = window.prompt("Nome desta visão (ex.: Pró-labore 6 meses):");
    if (!nome) return;
    startTransition(async () => {
      const r = await salvarVisaoAction(nome, paramsExtrato(emVigor.current).toString());
      if (r.erro) toast.error(r.erro);
      else toast.success("Visão salva.");
    });
  }

  function excluirVisao(v: VisaoSalvaItem) {
    if (!window.confirm(`Apagar a visão "${v.nome}"?`)) return;
    startTransition(async () => {
      const r = await excluirVisaoAction(v.id);
      if (r.erro) toast.error(r.erro);
    });
  }

  // Cada chip guarda só o que tirar do filtro; o clique faz a navegação.
  const ativos: { rotulo: string; patch: Partial<FiltroExtrato> }[] = [];
  if (filtro.tipo) ativos.push({ rotulo: filtro.tipo === "entrada" ? "Só entradas" : "Só saídas", patch: { tipo: undefined } });
  if (filtro.categoria) {
    const nome = filtro.categoria === "sem" ? "Sem categoria" : categorias.flatMap((g) => g.itens).find((i) => i.id === filtro.categoria)?.nome ?? "Categoria";
    ativos.push({ rotulo: nome, patch: { categoria: undefined } });
  }
  if (filtro.centro) {
    const nome = filtro.centro === "sem" ? "Sem centro" : centros.find((c) => c.id === filtro.centro)?.nome ?? "Centro";
    ativos.push({ rotulo: `Centro: ${nome}`, patch: { centro: undefined } });
  }
  if (filtro.conta) ativos.push({ rotulo: contas.find((c) => c.id === filtro.conta)?.nome ?? "Conta", patch: { conta: undefined } });
  if (filtro.pessoa) {
    const nome = filtro.pessoa === "sem" ? "Sem pessoa" : pessoas.find((p) => p.id === filtro.pessoa)?.nome ?? "Pessoa";
    ativos.push({ rotulo: nome, patch: { pessoa: undefined } });
  }
  if (filtro.min !== undefined || filtro.max !== undefined) {
    const r = filtro.min !== undefined && filtro.max !== undefined
      ? `R$ ${reais(filtro.min)} a ${reais(filtro.max)}`
      : filtro.min !== undefined
        ? `a partir de R$ ${reais(filtro.min)}`
        : `até R$ ${reais(filtro.max!)}`;
    ativos.push({ rotulo: r, patch: { min: undefined, max: undefined } });
  }
  if (filtro.origem) ativos.push({ rotulo: `Categoria ${ORIGEM_LABEL[filtro.origem]}`, patch: { origem: undefined } });

  const paramsAtuais = paramsExtrato(filtro).toString();

  return (
    <div className="mb-3 space-y-2">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("flex items-center gap-0.5", !porMes && "opacity-60")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            title="Mês anterior ([)"
            className="size-9 text-muted-foreground"
            onClick={() => {
              setIntervalo(false);
              navegar({ ...emVigor.current, periodo: undefined, de: undefined, ate: undefined, mes: deslocarMes(emVigor.current.mes, -1) });
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <select
            value={filtro.mes}
            onChange={(e) => {
              setIntervalo(false);
              navegar({ ...emVigor.current, periodo: undefined, de: undefined, ate: undefined, mes: e.target.value });
            }}
            aria-label="Mês"
            className={cn(SELECT, "min-w-40 font-medium", porMes && "border-primary text-on-primary-soft")}
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
            title="Próximo mês (])"
            className="size-9 text-muted-foreground"
            disabled={filtro.mes >= mesCorrente}
            onClick={() => navegar({ ...emVigor.current, periodo: undefined, de: undefined, ate: undefined, mes: deslocarMes(emVigor.current.mes, 1) })}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(PERIODO_LABEL) as PeriodoRapido[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => periodoRapido(p)}
              aria-pressed={filtro.periodo === p && !intervalo}
              className={cn(CHIP, filtro.periodo === p && !(filtro.de && filtro.ate) ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIntervalo((v) => !v)}
            aria-pressed={intervalo}
            className={cn(CHIP, intervalo || (filtro.de && filtro.ate) ? CHIP_ATIVO : CHIP_INATIVO)}
          >
            Intervalo
          </button>
        </div>
        {intervalo ? (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const de = String(fd.get("de") ?? "");
              const ate = String(fd.get("ate") ?? "");
              if (!de || !ate || de > ate) {
                toast.error("Informe as duas datas, com o início antes do fim.");
                return;
              }
              navegar({ ...emVigor.current, periodo: undefined, de, ate });
            }}
          >
            <input type="date" name="de" defaultValue={filtro.de ?? ""} max={hoje} aria-label="De" className={cn(SELECT, "h-8 text-xs")} />
            <span className="text-xs text-muted-foreground">a</span>
            <input type="date" name="ate" defaultValue={filtro.ate ?? hoje} max={hoje} aria-label="Até" className={cn(SELECT, "h-8 text-xs")} />
            <Button type="submit" size="sm" variant="secondary">
              Aplicar
            </Button>
          </form>
        ) : null}
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-wrap items-center gap-2">
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

        <Button
          type="button"
          variant={maisFiltros ? "secondary" : "ghost"}
          size="sm"
          className="text-muted-foreground"
          aria-expanded={maisFiltros}
          onClick={() => setMaisFiltros((v) => !v)}
        >
          <SlidersHorizontal className="size-3.5" /> Mais filtros
        </Button>

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

      {maisFiltros ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
          <select
            value={filtro.pessoa ?? ""}
            onChange={(e) => navegar({ ...emVigor.current, pessoa: e.target.value || undefined })}
            aria-label="Pessoa"
            className={cn(SELECT, "h-8 max-w-56 text-xs", filtro.pessoa && "border-primary text-on-primary-soft")}
          >
            <option value="">Qualquer pessoa</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
            <option value="sem">Sem pessoa reconhecida</option>
          </select>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const ler = (k: string) => {
                const t = String(fd.get(k) ?? "").trim();
                if (!t) return undefined;
                const n = Number(t.replace(/\./g, "").replace(",", "."));
                return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
              };
              navegar({ ...emVigor.current, min: ler("min"), max: ler("max") });
            }}
          >
            <span className="text-xs text-muted-foreground">Valor de</span>
            <input name="min" inputMode="decimal" defaultValue={filtro.min !== undefined ? reais(filtro.min) : ""} placeholder="0" aria-label="Valor mínimo" className={cn(SELECT, "h-8 w-24 text-xs")} />
            <span className="text-xs text-muted-foreground">a</span>
            <input name="max" inputMode="decimal" defaultValue={filtro.max !== undefined ? reais(filtro.max) : ""} placeholder="sem limite" aria-label="Valor máximo" className={cn(SELECT, "h-8 w-24 text-xs")} />
            <Button type="submit" size="sm" variant="secondary">
              Aplicar
            </Button>
          </form>
          <select
            value={filtro.origem ?? ""}
            onChange={(e) => navegar({ ...emVigor.current, origem: (e.target.value || undefined) as FiltroExtrato["origem"] })}
            aria-label="Origem da categoria"
            className={cn(SELECT, "h-8 text-xs", filtro.origem && "border-primary text-on-primary-soft")}
          >
            <option value="">Categoria de qualquer origem</option>
            {(Object.keys(ORIGEM_LABEL) as (keyof typeof ORIGEM_LABEL)[]).map((o) => (
              <option key={o} value={o}>
                Categoria {ORIGEM_LABEL[o]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* O que está ativo e as visões salvas */}
      {ativos.length > 0 || visoes.length > 0 || podeEditar ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {ativos.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              onClick={() => navegar({ ...emVigor.current, ...a.patch })}
              title="Tirar este filtro"
              className={cn(CHIP, CHIP_ATIVO, "pr-2")}
            >
              {a.rotulo} <X className="size-3" />
            </button>
          ))}
          {ativos.length > 0 && (visoes.length > 0 || podeEditar) ? <span className="mx-1 h-4 w-px bg-border" aria-hidden /> : null}
          {visoes.map((v) => {
            const ativa = v.params === paramsAtuais;
            return (
              <span key={v.id} className={cn(CHIP, ativa ? CHIP_ATIVO : CHIP_INATIVO, "gap-1.5 pr-1.5")}>
                <a href={`/extrato?${v.params}`} className="inline-flex items-center gap-1">
                  <Bookmark className="size-3" /> {v.nome}
                </a>
                {podeEditar ? (
                  <button type="button" onClick={() => excluirVisao(v)} aria-label={`Apagar visão ${v.nome}`} className="rounded-full p-0.5 hover:bg-black/5">
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            );
          })}
          {podeEditar && (ativos.length > 0 || !porMes) && !visoes.some((v) => v.params === paramsAtuais) ? (
            <button type="button" onClick={salvarVisao} className={cn(CHIP, CHIP_INATIVO, "border-dashed")}>
              <Bookmark className="size-3" /> Salvar visão
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
