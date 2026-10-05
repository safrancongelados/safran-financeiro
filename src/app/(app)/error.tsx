"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Erro numa tela do sistema. Mostra o código (digest) que aparece no registro
 * da Vercel, para achar o erro real sem expor detalhes do servidor na tela.
 */
export default function ErroDaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive-soft">
        <TriangleAlert className="size-6 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pode ter sido uma falha momentânea de conexão com o banco. Tente de novo; se continuar, anote o código abaixo.
      </p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-muted-foreground">código: {error.digest}</p> : null}
      <Button className="mt-6" onClick={() => reset()}>
        Tentar de novo
      </Button>
    </div>
  );
}
