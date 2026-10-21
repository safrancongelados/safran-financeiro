import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}

/** O esqueleto de uma tela padrão: cabeçalho, cartões de resumo e uma tabela. */
export function SkeletonDeTela({ tiles = 4, linhas = 8 }: { tiles?: number; linhas?: number }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label="Carregando">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      {tiles > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-card p-4">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
            <Skeleton className="h-3.5 w-10" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
