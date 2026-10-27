import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { AbasRelatorios } from "./abas";

export default function RelatoriosLayout({ children }: LayoutProps<"/relatorios">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Relatórios"
        description="Quem recebeu, o que custou, de quem se comprou e quanto foi de imposto — por período, com exportação em CSV."
      />
      <Suspense>
        <AbasRelatorios />
      </Suspense>
      {children}
    </div>
  );
}
