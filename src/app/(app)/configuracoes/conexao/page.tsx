import { Landmark } from "lucide-react";
import { listarConexoesComContas } from "@/db/queries/financeiro";
import { formatarCentavos } from "@/lib/dinheiro";
import { statusConexao, TIPO_CONTA_LABEL } from "@/lib/extrato";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConectarBancoButton } from "@/components/conexao/conectar-banco";
import { ConectarBancoForm } from "@/components/conexao/conectar-form";
import { SincronizarButton } from "@/components/conexao/sincronizar-button";

export const dynamic = "force-dynamic";
// Conectar e sincronizar chamam a Pluggy conta por conta.
export const maxDuration = 60;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

/** Alternativa ao widget: banco já autorizado pelo Meu Pluggy. */
function ViaMeuPluggy() {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-muted-foreground">Já conectou pelo Meu Pluggy? Cole o ID do item</summary>
      <div className="mt-3">
        <ConectarBancoForm />
      </div>
    </details>
  );
}

export default async function ConexaoPage() {
  const conexoes = await listarConexoesComContas();

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Como o extrato chega</CardTitle>
          <CardDescription>
            A conta da Safran é conectada pelo Open Finance (Pluggy), com o login de quem acessa a conta da empresa. O
            extrato é sincronizado todo dia às 07:00, a cada aviso do banco e quando alguém clica em{" "}
            <em>Sincronizar agora</em>. Lançamentos pendentes só entram quando o banco os efetiva.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {conexoes.length > 0 ? <SincronizarButton /> : null}
          <ConectarBancoButton variant={conexoes.length > 0 ? "secondary" : "primary"} />
          <ViaMeuPluggy />
        </CardContent>
      </Card>

      {conexoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum banco conectado ainda.</p>
      ) : (
        <Card className="gap-0 py-0">
          {conexoes.map((conexao) => {
            const st = statusConexao(conexao.status);
            return (
              <div key={conexao.id} className="space-y-3 border-b border-border px-5 py-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">{conexao.instituicao ?? "Banco"}</p>
                    <Badge variant={st.tom}>{st.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {conexao.dadosAtualizadosEm
                      ? `Banco consultado em ${DATA_HORA.format(conexao.dadosAtualizadosEm)}`
                      : "Banco ainda não consultado"}
                    {conexao.ultimoSyncEm ? ` · sync em ${DATA_HORA.format(conexao.ultimoSyncEm)}` : null}
                  </p>
                </div>

                {st.acao ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-on-warning-soft">{st.acao}</p>
                    {st.reconectar ? <ConectarBancoButton itemId={conexao.providerItemId} variant="secondary" /> : null}
                  </div>
                ) : null}
                {conexao.ultimoSyncOk === false ? (
                  <p className="text-sm text-destructive">Último sync falhou: {conexao.ultimoSyncDetalhe}</p>
                ) : null}

                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {conexao.contas.map((conta) => (
                    <li key={conta.id} className="rounded-lg border border-border px-3 py-2">
                      <p className="truncate text-sm font-medium text-foreground">{conta.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {TIPO_CONTA_LABEL[conta.subtipo ?? ""] ?? conta.subtipo ?? conta.tipo}
                        {conta.numero ? ` · ${conta.numero}` : null}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-foreground">
                        {conta.tipo === "CREDIT" ? "Fatura aberta " : "Saldo "}
                        {formatarCentavos(conta.saldoCentavos)}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  ID do item na Pluggy: <span className="font-mono">{conexao.providerItemId}</span>
                  {conexao.createdAt ? ` · conectado em ${DATA_HORA.format(conexao.createdAt)}` : null}
                </p>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
