import { ListChecks } from "lucide-react";
import { listarCategorias, listarLinhasDre } from "@/db/queries/financeiro";
import { categorizadasParaSugerir, semCategoriaParaRevisar } from "@/db/queries/relatorios";
import { obterSessao } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dinheiro";
import { opcoesDeCategoria } from "@/lib/opcoes";
import { podeEditar } from "@/lib/permissoes";
import { gruposParaRevisar } from "@/lib/revisao";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { ListaRevisao } from "./lista";

export const dynamic = "force-dynamic";
// Aprovar em lote reaplica as regras no extrato inteiro.
export const maxDuration = 60;

export default async function RevisarPage() {
  const sessao = await obterSessao();
  const [semCategoria, categorizadas, categorias, linhas] = await Promise.all([
    semCategoriaParaRevisar(),
    categorizadasParaSugerir(),
    listarCategorias(),
    listarLinhasDre(),
  ]);
  const grupos = gruposParaRevisar(semCategoria, categorizadas);
  const opcoes = opcoesDeCategoria(linhas, categorias);
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const comSugestao = grupos.filter((g) => g.sugestao).length;
  const total = semCategoria.reduce((acc, m) => acc + m.valorCentavos, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="A revisar"
        description="O que está sem categoria, agrupado por iguais, com a categoria sugerida pelo que você já categorizou antes. Aprovar cria a regra e vale para as próximas."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ListChecks} label="Lançamentos sem categoria" value={String(semCategoria.length)} tone={semCategoria.length > 0 ? "warning" : "success"} />
        <StatTile icon={ListChecks} label="Grupos" value={String(grupos.length)} hint="linhas iguais contam uma vez" />
        <StatTile icon={ListChecks} label="Com sugestão" value={String(comSugestao)} hint="aprováveis num clique" tone={comSugestao > 0 ? "success" : "default"} />
        <StatTile icon={ListChecks} label="Valor fora da DRE" value={formatarCentavos(total)} hint="entradas menos saídas sem categoria" />
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={ListChecks} title="Tudo categorizado" description="Nenhum lançamento em conta está sem categoria. A DRE está fechando com o extrato inteiro." actionHref="/dre" actionLabel="Ver a DRE" />
      ) : (
        <ListaRevisao
          grupos={grupos.map((g) => ({
            exemploId: g.exemplo.id,
            nome: g.exemplo.nomeExibicao ?? g.descricao,
            contraparte: g.exemplo.contraparte,
            pessoaNome: g.exemplo.pessoaNome,
            sentido: g.sentido,
            quantidade: g.quantidade,
            totalCentavos: g.totalCentavos,
            ultimaData: g.ultimaData,
            busca: g.busca,
            sugestao: g.sugestao ? { ...g.sugestao, nome: nomeCategoria.get(g.sugestao.categoriaId) ?? "" } : null,
          }))}
          opcoes={opcoes}
          podeEditar={podeEditar(sessao)}
        />
      )}
    </div>
  );
}
