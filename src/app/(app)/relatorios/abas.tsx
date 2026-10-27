"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/relatorios/pessoal", label: "Pessoal e sócios" },
  { href: "/relatorios/custos", label: "Custos" },
  { href: "/relatorios/fornecedores", label: "Fornecedores" },
  { href: "/relatorios/impostos", label: "Impostos" },
];

/** As abas dos relatórios. O período escolhido acompanha ao trocar de aba. */
export function AbasRelatorios() {
  const pathname = usePathname();
  const params = useSearchParams();
  const periodo = params.get("periodo") ? `?periodo=${params.get("periodo")}` : params.get("ano") ? `?ano=${params.get("ano")}` : "";
  return (
    <nav aria-label="Relatórios" className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={`${aba.href}${periodo}`}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
