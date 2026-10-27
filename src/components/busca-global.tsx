"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, FileText, Landmark, LayoutDashboard, ListChecks, Loader2, Receipt, Search, Settings, Tags, Users, type LucideIcon } from "lucide-react";
import { buscarGlobalAction, type ResultadoBusca } from "@/actions/busca";
import { normalizarTexto } from "@/lib/regras";
import { cn } from "@/lib/utils";

interface Pagina {
  titulo: string;
  href: string;
  icon: LucideIcon;
  /** Palavras que também encontram a página. */
  apelidos?: string;
}

const PAGINAS: Pagina[] = [
  { titulo: "Início", href: "/", icon: LayoutDashboard, apelidos: "resumo painel" },
  { titulo: "Extrato", href: "/extrato", icon: Receipt, apelidos: "lançamentos movimentações" },
  { titulo: "Extrato · sem categoria", href: "/extrato?categoria=sem&periodo=12m", icon: Tags, apelidos: "pendente categorizar" },
  { titulo: "A revisar", href: "/revisar", icon: ListChecks, apelidos: "sugestões categorizar pendências" },
  { titulo: "Pessoas", href: "/pessoas", icon: Users, apelidos: "funcionários sócios fornecedores clientes" },
  { titulo: "Relatórios · Pessoal e sócios", href: "/relatorios/pessoal", icon: FileText, apelidos: "pró-labore salários folha" },
  { titulo: "Relatórios · Custos", href: "/relatorios/custos", icon: FileText, apelidos: "despesas categorias" },
  { titulo: "Relatórios · Fornecedores", href: "/relatorios/fornecedores", icon: FileText, apelidos: "cnpj ranking" },
  { titulo: "Relatórios · Impostos", href: "/relatorios/impostos", icon: FileText, apelidos: "das darf simples tributos alíquota" },
  { titulo: "DRE", href: "/dre", icon: BarChart3, apelidos: "resultado margem" },
  { titulo: "Fluxo de caixa", href: "/fluxo-de-caixa", icon: Landmark, apelidos: "saldo" },
  { titulo: "Alertas", href: "/alertas", icon: Tags, apelidos: "avisos limites" },
  { titulo: "Configurações", href: "/configuracoes", icon: Settings, apelidos: "dre categorias regras conexão usuários histórico" },
];

type Item = { tipo: "pagina"; pagina: Pagina } | { tipo: "resultado"; resultado: ResultadoBusca };

/**
 * A busca global: Ctrl+K (ou ⌘K) abre; digitar encontra páginas na hora e,
 * com dois caracteres ou mais, pessoas, categorias e contrapartes no
 * servidor. Setas escolhem, Enter abre, Esc fecha.
 */
export function BuscaGlobal() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [pendente, startTransition] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  // Abrir e fechar zeram o estado aqui mesmo, não num efeito.
  function abrirBusca() {
    setQ("");
    setResultados([]);
    setAtivo(0);
    setAberta(true);
  }
  function fecharBusca() {
    setAberta(false);
  }

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((v) => {
          if (!v) {
            setQ("");
            setResultados([]);
            setAtivo(0);
          }
          return !v;
        });
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (aberta) campo.current?.focus();
  }, [aberta]);

  // A busca no servidor espera a pessoa parar de digitar; com menos de dois
  // caracteres, o onChange já limpou os resultados.
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        setResultados(await buscarGlobalAction(termo));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const termo = normalizarTexto(q);
  const paginas = termo ? PAGINAS.filter((p) => normalizarTexto(`${p.titulo} ${p.apelidos ?? ""}`).includes(termo)) : PAGINAS.slice(0, 6);
  const itens: Item[] = [...paginas.map((p): Item => ({ tipo: "pagina", pagina: p })), ...resultados.map((r): Item => ({ tipo: "resultado", resultado: r }))];
  const escolhido = Math.min(ativo, Math.max(0, itens.length - 1));

  function abrir(item: Item) {
    fecharBusca();
    router.push(item.tipo === "pagina" ? item.pagina.href : item.resultado.href);
  }
  const grupoDe = (item: Item) => (item.tipo === "pagina" ? "Páginas" : item.resultado.grupo);

  return (
    <>
      <button
        type="button"
        onClick={abrirBusca}
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        title="Buscar (Ctrl+K)"
      >
        <Search className="size-3.5" />
        <span className="flex-1">Buscar…</span>
        <kbd className="rounded border border-border px-1 font-mono text-[10px]">Ctrl K</kbd>
      </button>

      {aberta ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={fecharBusca}>
          <div
            role="dialog"
            aria-label="Busca"
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-elevation-3"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={campo}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setAtivo(0);
                  if (e.target.value.trim().length < 2) setResultados([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") fecharBusca();
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAtivo((a) => Math.min(a + 1, itens.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAtivo((a) => Math.max(a - 1, 0));
                  }
                  if (e.key === "Enter" && itens[escolhido]) abrir(itens[escolhido]);
                }}
                placeholder="Página, pessoa, categoria ou contraparte…"
                aria-label="Buscar"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
              />
              {pendente ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
              {itens.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nada encontrado.</li> : null}
              {itens.map((item, i) => {
                const grupo = grupoDe(item);
                const anterior = i > 0 ? grupoDe(itens[i - 1]) : null;
                const Icon = item.tipo === "pagina" ? item.pagina.icon : item.resultado.grupo === "Pessoas" ? Users : item.resultado.grupo === "Categorias" ? Tags : Receipt;
                return (
                  <li key={`${grupo}-${i}`} role="option" aria-selected={i === escolhido}>
                    {grupo !== anterior ? <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</p> : null}
                    <button
                      type="button"
                      onMouseEnter={() => setAtivo(i)}
                      onClick={() => abrir(item)}
                      className={cn("flex w-full items-center gap-3 px-4 py-2 text-left text-sm", i === escolhido ? "bg-primary-soft text-on-primary-soft" : "text-foreground")}
                    >
                      <Icon className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.tipo === "pagina" ? item.pagina.titulo : item.resultado.titulo}</span>
                        {item.tipo === "resultado" && item.resultado.detalhe ? (
                          <span className="block truncate text-xs text-muted-foreground">{item.resultado.detalhe}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
