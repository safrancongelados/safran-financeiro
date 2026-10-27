import Link from "next/link";
import { ArrowRight, Bell, BellOff, CircleAlert } from "lucide-react";
import { alertasDisparados, listarAlertas } from "@/db/queries/alertas";
import { ALERTA_INFO } from "@/lib/alertas";
import { obterSessao } from "@/lib/auth";
import { hojeISO } from "@/lib/periodo";
import { podeEditar } from "@/lib/permissoes";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ConfigAlertas } from "./config";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const sessao = await obterSessao();
  const hoje = hojeISO();
  const [disparados, configs] = await Promise.all([alertasDisparados(hoje), listarAlertas()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Alertas"
        description="O que merece atenção agora, pelos limites configurados abaixo. Os mesmos avisos aparecem no Início e no resumo semanal."
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Agora <span className="font-normal text-muted-foreground">· {disparados.length} alerta(s)</span>
        </h2>
        {disparados.length === 0 ? (
          <EmptyState icon={BellOff} title="Nenhum alerta" description="Nada passou dos limites configurados. Os avisos somem sozinhos quando a situação muda." />
        ) : (
          <Card className="py-0">
            <ul className="divide-y divide-border">
              {disparados.map((a, i) => (
                <li key={`${a.tipo}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-start gap-2">
                    <CircleAlert className={cn("mt-0.5 size-4 shrink-0", a.gravidade === "alta" ? "text-destructive" : "text-warning")} />
                    <div className="min-w-0">
                      <p className="text-foreground">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.detalhe}</p>
                    </div>
                  </div>
                  <Link href={a.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline">
                    {a.acao} <ArrowRight className="size-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          <Bell className="mr-1 inline size-4" /> Limites
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Cada alerta pode ser ligado, desligado e ajustado. Valores em reais; os avisos são recalculados a cada visita.</p>
        <ConfigAlertas
          itens={(Object.keys(ALERTA_INFO) as (keyof typeof ALERTA_INFO)[]).map((tipo) => {
            const c = configs.find((x) => x.tipo === tipo);
            return { tipo, ativo: c?.ativo ?? true, parametros: (c?.parametros ?? {}) as Record<string, number> };
          })}
          podeEditar={podeEditar(sessao)}
        />
      </section>
    </div>
  );
}
