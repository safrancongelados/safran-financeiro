"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { aplicarSugestoesAction } from "@/actions/categorias";
import { formatarCentavos } from "@/lib/dinheiro";
import { hrefExtrato } from "@/lib/extrato-filtros";
import type { GrupoOpcoes } from "@/lib/opcoes";
import { rotuloDia } from "@/lib/periodo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface GrupoRevisao {
  exemploId: string;
  nome: string;
  contraparte: string | null;
  pessoaNome: string | null;
  sentido: "entrada" | "saida";
  quantidade: number;
  totalCentavos: number;
  ultimaData: string;
  busca: string;
  sugestao: { categoriaId: string; nome: string; motivo: string; apoio: number } | null;
}

const SELECT =
  "h-8 w-56 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

/**
 * A lista de grupos a revisar. Cada linha tem a categoria sugerida (ou
 * nenhuma) num seletor; "Aprovar" grava para o grupo inteiro, e "Aprovar
 * todas as sugestões" faz isso de uma vez para as que têm sugestão.
 */
export function ListaRevisao({ grupos, opcoes, podeEditar }: { grupos: GrupoRevisao[]; opcoes: GrupoOpcoes[]; podeEditar: boolean }) {
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(grupos.map((g) => [g.exemploId, g.sugestao?.categoriaId ?? ""]))
  );
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [pendente, startTransition] = useTransition();

  function aplicar(itens: { movimentacaoId: string; categoriaId: string }[]) {
    if (itens.length === 0) return;
    startTransition(async () => {
      const r = await aplicarSugestoesAction(itens);
      if (r.erro) {
        toast.error(r.erro);
        return;
      }
      setFeitos((f) => new Set([...f, ...itens.map((i) => i.movimentacaoId)]));
      toast.success(`${r.regras} regra(s) criada(s); ${r.alteradas} lançamento(s) categorizados.`);
    });
  }

  const pendentes = grupos.filter((g) => !feitos.has(g.exemploId));
  const aprovaveis = pendentes.filter((g) => g.sugestao && escolhas[g.exemploId]);

  return (
    <>
      {podeEditar && aprovaveis.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 px-4 py-2.5">
          <p className="text-sm text-on-primary-soft">
            <Sparkles className="mr-1 inline size-4" />
            {aprovaveis.length} grupo(s) com sugestão, somando {aprovaveis.reduce((a, g) => a + g.quantidade, 0)} lançamento(s).
          </p>
          <Button
            type="button"
            size="sm"
            disabled={pendente}
            onClick={() => aplicar(aprovaveis.map((g) => ({ movimentacaoId: g.exemploId, categoriaId: escolhas[g.exemploId] })))}
          >
            <Check className="size-4" /> Aprovar todas as sugestões
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden py-0">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Lançamento</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendentes.map((g) => (
              <TableRow key={g.exemploId}>
                <TableCell className="max-w-80 whitespace-normal">
                  <span className="font-medium text-foreground">{g.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {g.pessoaNome ? `${g.pessoaNome} · ` : g.contraparte ? `${g.contraparte} · ` : ""}
                    {g.sentido === "entrada" ? "entrada" : "saída"} · último em {rotuloDia(g.ultimaData)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Link href={hrefExtrato({ mes: g.ultimaData.slice(0, 7), periodo: "12m", q: g.busca, categoria: "sem" })} className="underline-offset-2 hover:underline">
                    {g.quantidade}
                  </Link>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", g.totalCentavos > 0 ? "text-on-success-soft" : "text-foreground")}>
                  {formatarCentavos(g.totalCentavos)}
                </TableCell>
                <TableCell>
                  <select
                    value={escolhas[g.exemploId] ?? ""}
                    disabled={!podeEditar || pendente}
                    onChange={(e) => setEscolhas((c) => ({ ...c, [g.exemploId]: e.target.value }))}
                    aria-label="Categoria"
                    className={cn(SELECT, g.sugestao && escolhas[g.exemploId] === g.sugestao.categoriaId && "border-primary")}
                  >
                    <option value="">Escolher…</option>
                    {opcoes.map((grupo) => (
                      <optgroup key={grupo.label} label={grupo.label}>
                        {grupo.itens.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {g.sugestao ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <Sparkles className="mr-1 inline size-3 text-primary" />
                      sugestão por {g.sugestao.motivo} ({g.sugestao.apoio} parecida{g.sugestao.apoio === 1 ? "" : "s"})
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-muted-foreground">sem parecidas já categorizadas</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {podeEditar ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={escolhas[g.exemploId] ? "primary" : "ghost"}
                      disabled={!escolhas[g.exemploId] || pendente}
                      onClick={() => aplicar([{ movimentacaoId: g.exemploId, categoriaId: escolhas[g.exemploId] }])}
                    >
                      Aprovar
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {pendentes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Tudo revisado nesta sessão. Recarregue para conferir o que sobrou.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
