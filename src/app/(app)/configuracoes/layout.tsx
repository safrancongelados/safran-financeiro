import { obterSessao } from "@/lib/auth";
import { podeGerirAcessos } from "@/lib/permissoes";
import { PageHeader } from "@/components/page-header";
import { AbasConfiguracoes } from "./abas";

export default async function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  const sessao = await obterSessao();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Configurações"
        description="A estrutura da DRE (linhas e categorias), os centros de custo, as regras que levam cada lançamento ao lugar certo, a conexão com o banco, o histórico do que mudou e os acessos."
      />
      <AbasConfiguracoes dono={podeGerirAcessos(sessao)} />
      {children}
    </div>
  );
}
