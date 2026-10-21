import { PageHeader } from "@/components/page-header";
import { AbasConfiguracoes } from "./abas";

export default function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Configurações"
        description="A estrutura da DRE (linhas e categorias), os centros de custo, as regras que levam cada lançamento ao lugar certo e a conexão com o banco."
      />
      <AbasConfiguracoes />
      {children}
    </div>
  );
}
