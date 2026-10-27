import { redirect } from "next/navigation";
import { listarCategorias, listarLinhasDre } from "@/db/queries/financeiro";
import { obterSessao } from "@/lib/auth";
import { opcoesDeCategoria } from "@/lib/opcoes";
import { identificadorDe } from "@/lib/pessoas";
import { podeEditar } from "@/lib/permissoes";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PessoaForm } from "../pessoa-form";

export const dynamic = "force-dynamic";

export default async function NovaPessoaPage({ searchParams }: PageProps<"/pessoas/nova">) {
  const sessao = await obterSessao();
  if (!podeEditar(sessao)) redirect("/pessoas");
  const params = await searchParams;
  const [categorias, linhas] = await Promise.all([listarCategorias(), listarLinhasDre()]);

  // Vindo do extrato: o nome da contraparte e o documento já preenchidos, e
  // o trecho que o sync vai procurar daqui em diante.
  const nome = typeof params.nome === "string" ? params.nome.trim().slice(0, 80) : "";
  const documento = typeof params.documento === "string" ? params.documento.replace(/\D/g, "") : "";
  const ident = nome ? identificadorDe({ contraparte: nome, contraparteDocumento: documento || null, descricao: nome }) : null;
  const titulo = nome ? `${nome.charAt(0)}${nome.slice(1).toLowerCase()}` : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Nova pessoa" description="Depois de salvar, o extrato inteiro é reconhecido de novo: os lançamentos dela ganham o vínculo e, se houver, a categoria padrão." />
      <Card>
        <CardContent>
          <PessoaForm
            categorias={opcoesDeCategoria(linhas, categorias)}
            inicial={{
              nome: titulo,
              documento,
              padrao: ident && "padrao" in ident ? ident.padrao : "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
