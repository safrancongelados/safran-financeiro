import { Skeleton } from "@/components/skeleton";

export default function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-3">
      <Skeleton className="h-28 rounded-xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
