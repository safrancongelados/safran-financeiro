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
  compacto = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
  tone?: "default" | "success" | "warning" | "destructive";
  /** Para onde o cartão leva, quando é um atalho (ex.: o que falta categorizar). */
  href?: string;
  /** Para fileiras de cinco: ícone menor e valor um pouco menor, para o número caber inteiro. */
  compacto?: boolean;
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
      <div
        className={cn(
          "hidden shrink-0 items-center justify-center rounded-lg sm:flex",
          compacto ? "size-7" : "size-9",
          toneClasses[tone]
        )}
      >
        <Icon className={compacto ? "size-3.5" : "size-4.5"} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-semibold leading-tight text-foreground",
            compacto ? "text-base" : "text-base sm:truncate sm:text-lg"
          )}
        >
          {value}
        </p>
        {delta ? <p className={cn("text-xs font-medium", deltaClasses[delta.tom])}>{delta.texto}</p> : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </>
  );
  const classe = cn(
    "flex min-w-0 items-center overflow-hidden rounded-xl border border-border bg-card shadow-sm",
    compacto ? "gap-2.5 px-3 py-3" : "gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5"
  );

  if (href) {
    return (
      <Link href={href} className={cn(classe, "transition-colors hover:border-primary/40 hover:bg-primary-soft/30")}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classe}>{conteudo}</div>;
}
