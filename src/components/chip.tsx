import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Filtro em forma de pílula: link que marca o que está em vigor. */
export function Chip({
  href,
  ativo,
  children,
  className,
}: {
  href: string;
  ativo: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativo ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
        ativo
          ? "border-primary bg-primary-soft text-on-primary-soft"
          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
        className
      )}
    >
      {children}
    </Link>
  );
}

/** Um grupo de chips com rótulo à esquerda. */
export function GrupoChips({ rotulo, children }: { rotulo?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rotulo ? <span className="mr-0.5 text-xs text-muted-foreground">{rotulo}</span> : null}
      {children}
    </div>
  );
}
