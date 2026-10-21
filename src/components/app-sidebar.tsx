"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Landmark, LayoutDashboard, LogOut, Menu, Receipt, KeyRound, Settings, X } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Início", icon: LayoutDashboard, exato: true },
  { href: "/extrato", label: "Extrato", icon: Receipt },
  { href: "/dre", label: "DRE", icon: BarChart3 },
  { href: "/fluxo-de-caixa", label: "Fluxo de caixa", icon: Landmark },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        S
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight text-foreground">Safran</p>
        <p className="text-[11px] leading-tight text-muted-foreground">Financeiro</p>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {LINKS.map((link) => {
        const ativo = link.exato ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              ativo
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4.5 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserFooter({ nome }: { nome: string }) {
  return (
    <div className="flex items-center justify-between gap-1 px-2">
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{nome}</p>
      <div className="flex shrink-0 items-center">
        <Button asChild variant="ghost" size="icon" title="Trocar senha" className="text-muted-foreground">
          <Link href="/senha" aria-label="Trocar senha">
            <KeyRound className="size-4" />
          </Link>
        </Button>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon" title="Sair" aria-label="Sair" className="text-muted-foreground">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AppSidebar({ nome }: { nome: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Barra superior — só em telas pequenas */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <Brand />
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Sidebar fixa — desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <div className="mb-6">
          <Brand />
        </div>
        <NavLinks />
        <div className="mt-auto pt-4">
          <UserFooter nome={nome} />
        </div>
      </aside>

      {/* Sidebar em overlay — mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </Button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto pt-4">
              <UserFooter nome={nome} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
