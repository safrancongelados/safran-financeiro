import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Delta {
  /** Texto curto: "+12,3% vs set" ou "+R$ 1.200 vs set". */
  texto: string;
  tom: "success" | "destructive" | "muted";
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  tone = "default",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
  tone?: "default" | "success" | "warning" | "destructive";
  /** Para onde o cartão leva, quando é um atalho (ex.: o que falta categorizar). */
  href?: string;
}) {
  const toneClasses = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };
  const deltaClasses = { success: "text-on-success-soft", destructive: "text-destructive", muted: "text-muted-foreground" };

  // No celular o cartão é estreito: o ícone sai e o valor diminui, para o número nunca ser cortado.
  const conteudo = (
    <>
      <div className={cn("hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex", toneClasses[tone])}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold leading-tight text-foreground sm:truncate sm:text-lg">{value}</p>
        {delta ? <p className={cn("text-xs font-medium", deltaClasses[delta.tom])}>{delta.texto}</p> : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </>
  );
  const classe = "flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm sm:px-4 sm:py-3.5";

  if (href) {
    return (
      <Link href={href} className={cn(classe, "transition-colors hover:border-primary/40 hover:bg-primary-soft/30")}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classe}>{conteudo}</div>;
}
