"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Landmark, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { abrirConexaoAction, registrarItemAction } from "@/actions/extrato";
import { CNPJ_SAFRAN } from "@/lib/pluggy/movimentacoes";
import { Button } from "@/components/ui/button";

// O widget mexe em `window` já na importação: só existe no navegador.
const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((m) => m.PluggyConnect), { ssr: false });

/**
 * Abre o Pluggy Connect para conectar um banco novo ou, com `itemId`, renovar
 * o consentimento de uma conexão que expirou. A autorização acontece no app do
 * banco, com o login de quem tem acesso à conta da empresa.
 */
export function ConectarBancoButton({ itemId, variant = "primary" }: { itemId?: string; variant?: "primary" | "secondary" }) {
  const [token, setToken] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const renovar = itemId !== undefined;

  function abrir() {
    startTransition(async () => {
      const r = await abrirConexaoAction(itemId);
      if (r.token) setToken(r.token);
      else toast.error(r.erro ?? "Não foi possível abrir a conexão.");
    });
  }

  return (
    <>
      <Button type="button" variant={variant} size={renovar ? "sm" : "default"} disabled={pendente} onClick={abrir}>
        {renovar ? <RotateCw className="size-4" /> : <Landmark className="size-4" />}
        {pendente ? "Abrindo…" : renovar ? "Reconectar" : "Conectar banco"}
      </Button>

      {token ? (
        <PluggyConnect
          connectToken={token}
          updateItem={itemId}
          includeSandbox={process.env.NODE_ENV !== "production"}
          countries={["BR"]}
          language="pt"
          // No Open Finance, já chega com o CNPJ da Safran preenchido.
          openFinanceParameters={{ cnpj: CNPJ_SAFRAN }}
          onClose={() => setToken(null)}
          onError={(erro) => {
            toast.error(`Pluggy: ${erro.message}`);
          }}
          onSuccess={({ item }) => {
            setToken(null);
            startTransition(async () => {
              const r = await registrarItemAction(item.id);
              if (r.ok) toast.success(r.ok);
              else toast.error(r.erro ?? "Banco conectado, mas o extrato não foi puxado.");
            });
          }}
        />
      ) : null}
    </>
  );
}
