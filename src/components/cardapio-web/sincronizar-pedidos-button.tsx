"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sincronizarPedidosAction } from "@/actions/cardapio-web";
import { Button } from "@/components/ui/button";

/**
 * Puxa os pedidos do Cardápio Web na hora, sem esperar o cron. Cada rodada
 * detalha até 150 pedidos; com histórico grande, o aviso pede para rodar de
 * novo. Rodar duas vezes é seguro: o sync é upsert pelo ID do pedido.
 */
export function SincronizarPedidosButton({ variant = "secondary" }: { variant?: "secondary" | "primary" }) {
  const [rodando, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      disabled={rodando}
      onClick={() => {
        startTransition(async () => {
          const r = await sincronizarPedidosAction();
          if ("erro" in r) {
            toast.error(r.erro);
            return;
          }
          if (r.pendentes > 0) {
            toast.warning(`${r.gravados} pedido(s) gravado(s); faltam ${r.pendentes}. Clique de novo para continuar.`);
          } else {
            toast.success(`${r.gravados} pedido(s) gravado(s). Histórico em dia.`);
          }
        });
      }}
    >
      <RefreshCw className={rodando ? "size-4 animate-spin" : "size-4"} />
      {rodando ? "Sincronizando…" : "Sincronizar pedidos"}
    </Button>
  );
}
