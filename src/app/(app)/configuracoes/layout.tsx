import { PageHeader } from "@/components/page-header";
import { AbasConfiguracoes } from "./abas";

export default function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Configurações"
        description="Como a DRE é montada: as linhas, as categorias de cada linha, os centros de custo e as regras que levam cada lançamento do extrato ao lugar certo."
      />
      <AbasConfiguracoes />
      {children}
    </div>
  );
}
