"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/configuracoes", label: "Estrutura da DRE" },
  { href: "/configuracoes/centros-de-custo", label: "Centros de custo" },
  { href: "/configuracoes/regras", label: "Regras" },
];

export function AbasConfiguracoes() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
