"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sincronizarExtratoAction } from "@/actions/extrato";
import { Button } from "@/components/ui/button";

/**
 * Puxa o extrato na hora, sem esperar o cron diário. Rodar duas vezes é
 * seguro: o sync é upsert pelo ID da Pluggy.
 */
export function SincronizarButton() {
  const [rodando, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={rodando}
      onClick={() => {
        startTransition(async () => {
          const r = await sincronizarExtratoAction();
          if ("erro" in r) {
            toast.error(r.erro);
            return;
          }
          for (const banco of r) {
            const nome = banco.instituicao ?? "Banco";
            if (banco.ok) toast.success(`${nome}: ${banco.movimentacoes} movimentação(ões) sincronizada(s).`);
            else toast.error(`${nome}: ${banco.erro}`);
          }
        });
      }}
    >
      <RefreshCw className={rodando ? "size-4 animate-spin" : "size-4"} />
      {rodando ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  );
}
