"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { aplicarRegrasAction } from "@/actions/categorias";
import { Button } from "@/components/ui/button";

/**
 * Roda as regras sobre todo o extrato na hora — para regras que chegaram
 * por fora da tela (migration), sem esperar o próximo sync.
 */
export function AplicarRegrasButton() {
  const [rodando, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={rodando}
      onClick={() => {
        startTransition(async () => {
          const r = await aplicarRegrasAction();
          if (r.erro) toast.error(r.erro);
          else toast.success(`${r.alteradas ?? 0} movimentação(ões) categorizada(s) ou recategorizada(s).`);
        });
      }}
    >
      <Play className="size-4" />
      {rodando ? "Aplicando…" : "Aplicar regras agora"}
    </Button>
  );
}
