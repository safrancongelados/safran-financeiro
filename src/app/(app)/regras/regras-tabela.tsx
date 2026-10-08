"use client";

import { useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { atualizarRegraAction, excluirRegraAction } from "@/actions/categorias";
import type { CampoRegra, SentidoRegra } from "@/db/schema";
import { formatarDocumento } from "@/lib/extrato";
import { normalizarTexto } from "@/lib/regras";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { GrupoOpcoes } from "../extrato/categoria-select";

const CAMPO = { documento: "CPF/CNPJ é", contraparte: "Contraparte contém", descricao: "Descrição contém" } as const;
const SENTIDO = { entrada: "entradas", saida: "saídas", ambos: "entradas e saídas" } as const;

const SELECT =
  "h-8 w-52 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

export interface RegraEditavel {
  id: string;
  campo: CampoRegra;
  padrao: string;
  sentido: SentidoRegra;
  nomeExibicao: string | null;
  categoriaId: string;
  categoriaNome: string;
  lancamentos: number;
}

function LinhaRegra({ regra, opcoes }: { regra: RegraEditavel; opcoes: GrupoOpcoes[] }) {
  const [nome, setNome] = useState(regra.nomeExibicao ?? "");
  const [categoriaId, setCategoriaId] = useState(regra.categoriaId);
  const [salvando, startTransition] = useTransition();
  const mudou = nome.trim() !== (regra.nomeExibicao ?? "") || categoriaId !== regra.categoriaId;
  const conhecida = opcoes.some((g) => g.itens.some((i) => i.id === regra.categoriaId));

  function salvar() {
    if (!mudou || salvando) return;
    startTransition(async () => {
      const r = await atualizarRegraAction(regra.id, categoriaId, nome);
      if (r.erro) toast.error(r.erro);
      else toast.success(r.alteradas ? `Regra salva. ${r.alteradas} movimentação(ões) recategorizada(s).` : "Regra salva.");
    });
  }

  return (
    // O selo "auto" do extrato aponta para cá (#regra-<id>).
    <TableRow id={`regra-${regra.id}`} className="scroll-mt-20 target:bg-secondary">
      <TableCell className="max-w-56 whitespace-normal">
        <span className="text-muted-foreground">{CAMPO[regra.campo]} </span>
        <span className="font-medium text-foreground">
          {regra.campo === "documento" ? formatarDocumento(regra.padrao) : `“${regra.padrao}”`}
        </span>
        <span className="block text-xs text-muted-foreground">{SENTIDO[regra.sentido]}</span>
      </TableCell>
      <TableCell>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
          }}
          maxLength={80}
          placeholder="descrição do banco"
          aria-label="Mostrar no extrato como"
          className="h-8 w-52 text-xs"
        />
      </TableCell>
      <TableCell>
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          aria-label="Categoria"
          className={SELECT}
        >
          {!conhecida ? <option value={regra.categoriaId}>{regra.categoriaNome} (inativa)</option> : null}
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
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{regra.lancamentos}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button type="button" size="sm" variant={mudou ? "primary" : "ghost"} disabled={!mudou || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          <form
            action={excluirRegraAction}
            onSubmit={(e) => {
              if (!confirm("Apagar esta regra? O que ela categorizou volta para sem categoria (ou para outra regra que case).")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={regra.id} />
            <Button type="submit" variant="ghost" size="icon" title="Apagar regra" className="text-muted-foreground">
              <Trash2 className="size-4" />
            </Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Regras com categoria e nome de exibição editáveis na própria linha. */
export function RegrasTabela({ regras, opcoes }: { regras: RegraEditavel[]; opcoes: GrupoOpcoes[] }) {
  const [busca, setBusca] = useState("");
  const termo = normalizarTexto(busca);
  const visiveis = termo
    ? regras.filter((r) =>
        normalizarTexto(`${r.padrao} ${r.nomeExibicao ?? ""} ${r.categoriaNome}`).includes(termo)
      )
    : regras;

  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por texto, nome ou categoria"
          aria-label="Buscar regra"
          className="h-9 pl-8"
        />
      </div>
      <Card className="overflow-hidden py-0">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Mostrar no extrato como</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Lanç.</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {regras.length === 0 ? "Nenhuma regra ainda." : "Nenhuma regra com esse texto."}
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((r) => (
                // Remonta quando o servidor devolve outra categoria ou nome, para o estado local não ficar velho.
                <LinhaRegra key={`${r.id}-${r.categoriaId}-${r.nomeExibicao ?? ""}`} regra={r} opcoes={opcoes} />
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
