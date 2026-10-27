"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarAlertaAction } from "@/actions/alertas";
import type { TipoAlerta } from "@/db/schema";
import { ALERTA_INFO, type CampoParametro } from "@/lib/alertas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Item {
  tipo: TipoAlerta;
  ativo: boolean;
  parametros: Record<string, number>;
}

const INPUT =
  "h-8 w-28 rounded-md border border-input bg-card px-2 text-right text-xs tabular-nums shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60";

function paraTela(campo: CampoParametro, v: number | undefined): string {
  const valor = v ?? campo.padrao;
  return campo.formato === "reais" ? (valor / 100).toFixed(2).replace(".", ",") : String(valor);
}

function daTela(campo: CampoParametro, texto: string): number {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return campo.formato === "reais" ? Math.round(n * 100) : n;
}

function LinhaAlerta({ item, podeEditar }: { item: Item; podeEditar: boolean }) {
  const info = ALERTA_INFO[item.tipo];
  const [ativo, setAtivo] = useState(item.ativo);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(info.campos.map((c) => [c.chave, paraTela(c, item.parametros[c.chave])])));
  const [salvando, startTransition] = useTransition();
  const mudou = ativo !== item.ativo || info.campos.some((c) => daTela(c, valores[c.chave]) !== (item.parametros[c.chave] ?? c.padrao));

  function salvar() {
    const parametros: Record<string, number> = {};
    for (const c of info.campos) parametros[c.chave] = daTela(c, valores[c.chave]);
    startTransition(async () => {
      const r = await salvarAlertaAction(item.tipo, { ativo, parametros });
      if (r.erro) toast.error(r.erro);
      else toast.success("Alerta salvo.");
    });
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !ativo && "opacity-70")}>
      <label className="flex min-w-0 flex-1 items-start gap-3">
        <input type="checkbox" checked={ativo} disabled={!podeEditar || salvando} onChange={(e) => setAtivo(e.target.checked)} className="mt-1 accent-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{info.titulo}</span>
          <span className="block text-xs text-muted-foreground">{info.descricao}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {info.campos.map((c) => (
          <label key={c.chave} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {c.rotulo}
            {c.formato === "reais" ? <span>R$</span> : null}
            <input
              value={valores[c.chave]}
              disabled={!podeEditar || salvando}
              inputMode="decimal"
              onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
              aria-label={`${info.titulo}: ${c.rotulo}`}
              className={INPUT}
            />
            {c.formato === "percentual" ? <span>%</span> : c.formato === "dias" ? <span>dias</span> : null}
          </label>
        ))}
        {podeEditar ? (
          <Button type="button" size="sm" variant={mudou ? "primary" : "ghost"} disabled={!mudou || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ConfigAlertas({ itens, podeEditar }: { itens: Item[]; podeEditar: boolean }) {
  return (
    <Card className="py-0">
      <ul className="divide-y divide-border">
        {itens.map((item) => (
          <LinhaAlerta key={item.tipo} item={item} podeEditar={podeEditar} />
        ))}
      </ul>
    </Card>
  );
}
