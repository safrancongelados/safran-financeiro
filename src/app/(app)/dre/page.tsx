import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, Percent, Tags, TrendingUp } from "lucide-react";
import { categoriasParaDre, contarSemCategoria, listarConexoesComContas, somasPorMesECategoria } from "@/db/queries/financeiro";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { montarDre, type Dre } from "@/lib/dre";
import type { GrupoDre } from "@/db/schema";
import { GRUPOS } from "@/lib/grupos";
import { anoValido, mesAtual, mesesDoAno } from "@/lib/periodo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { TabelaMensal, type LinhaTabela } from "@/components/tabela-mensal";

export const dynamic = "force-dynamic";

const hrefCategoria = (id: string) => (mes: string) => `/extrato?mes=${mes}&categoria=${id}`;

function blocoDoGrupo(dre: Dre, grupo: GrupoDre, prefixo: string): LinhaTabela[] {
  const g = dre.grupos[grupo];
  const label = GRUPOS.find((x) => x.id === grupo)!.label;
  return [
    { tipo: "grupo", label: `${prefixo} ${label}`.trim(), serie: g },
    ...g.categorias.map(
      (c): LinhaTabela => ({ tipo: "categoria", label: c.categoria.nome, serie: c, href: hrefCategoria(c.categoria.id) })
    ),
  ];
}

export default async function DrePage({ searchParams }: PageProps<"/dre">) {
  const { ano: anoParam } = await searchParams;
  const hoje = mesAtual();
  const anoCorrente = Number(hoje.slice(0, 4));
  const ano =
    typeof anoParam === "string" && anoValido(anoParam) && Number(anoParam) <= anoCorrente ? Number(anoParam) : anoCorrente;
  // Mês que ainda não chegou não tem coluna.
  const meses = mesesDoAno(ano).filter((m) => m <= hoje);

  const [conexoes, categorias, somas, semCategoria] = await Promise.all([
    listarConexoesComContas(),
    categoriasParaDre(),
    somasPorMesECategoria(`${ano}-01-01`, `${ano + 1}-01-01`),
    contarSemCategoria(),
  ]);

  const navegacao = (
    <div className="flex items-center gap-1">
      <Link href={`/dre?ano=${ano - 1}`} aria-label="Ano anterior" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
        <ChevronLeft className="size-4" />
      </Link>
      <p className="w-14 text-center text-sm font-semibold text-foreground">{ano}</p>
      {ano < anoCorrente ? (
        <Link href={`/dre?ano=${ano + 1}`} aria-label="Próximo ano" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="p-1.5 text-muted-foreground/30">
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );

  if (conexoes.length === 0 || somas.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="DRE" description="Demonstração do resultado, mês a mês, pelo extrato da conta" action={navegacao} />
        <EmptyState
          icon={BarChart3}
          title={conexoes.length === 0 ? "Conta ainda não conectada" : `Sem movimentações em ${ano}`}
          description={
            conexoes.length === 0
              ? "Conecte a conta da Safran no Extrato. A DRE é montada a partir das movimentações categorizadas."
              : "Escolha outro ano ou sincronize o extrato."
          }
          actionHref="/extrato"
          actionLabel="Ir para o extrato"
        />
      </div>
    );
  }

  // Começa no primeiro mês com movimento: o Open Finance só traz cerca de um
  // ano de histórico, e colunas vazias antes disso só empurram a tabela.
  const primeiroComDado = somas.reduce((min, s) => (s.mes < min ? s.mes : min), meses[meses.length - 1]);
  const mesesComDado = meses.filter((m) => m >= primeiroComDado);
  const dre = montarDre(mesesComDado, categorias, somas);

  const linhas: LinhaTabela[] = [
    ...blocoDoGrupo(dre, "receita", ""),
    ...blocoDoGrupo(dre, "deducao", "(−)"),
    { tipo: "subtotal", label: "= Receita líquida", serie: dre.receitaLiquida },
    ...blocoDoGrupo(dre, "custo_variavel", "(−)"),
    { tipo: "subtotal", label: "= Margem de contribuição", serie: dre.margemContribuicao },
    { tipo: "percentual", label: "% da receita líquida", parte: dre.margemContribuicao, base: dre.receitaLiquida },
    ...blocoDoGrupo(dre, "despesa_fixa", "(−)"),
    { tipo: "subtotal", label: "= Resultado operacional", serie: dre.resultadoOperacional },
    ...blocoDoGrupo(dre, "financeiro", "(±)"),
    { tipo: "destaque", label: "= Resultado líquido", serie: dre.resultadoLiquido },
    { tipo: "percentual", label: "% da receita líquida", parte: dre.resultadoLiquido, base: dre.receitaLiquida },
    { tipo: "secao", label: "Fora da DRE — só mexem no caixa" },
    ...blocoDoGrupo(dre, "investimento", ""),
    ...blocoDoGrupo(dre, "financiamento", ""),
    ...blocoDoGrupo(dre, "socios", ""),
    ...blocoDoGrupo(dre, "transferencia", ""),
    ...(dre.semCategoria.total !== 0 || Object.values(dre.semCategoria.porMes).some((v) => v !== 0)
      ? [
          {
            tipo: "alerta",
            label: "Sem categoria",
            serie: dre.semCategoria,
            href: (mes: string) => `/extrato?mes=${mes}&sem=1`,
          } satisfies LinhaTabela,
        ]
      : []),
    { tipo: "subtotal", label: "= Variação do caixa", serie: dre.variacaoCaixa },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="DRE"
        description="Regime de caixa: cada valor entra no mês em que passou pela conta."
        action={navegacao}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={TrendingUp} label={`Receita bruta ${ano}`} value={formatarCentavos(dre.grupos.receita.total)} />
        <StatTile
          icon={Percent}
          label="Margem de contribuição"
          value={formatarPercentual(dre.margemContribuicao.total, dre.receitaLiquida.total)}
          hint={formatarCentavos(dre.margemContribuicao.total)}
        />
        <StatTile
          icon={BarChart3}
          label={`Resultado líquido ${ano}`}
          value={formatarCentavos(dre.resultadoLiquido.total)}
          tone={dre.resultadoLiquido.total < 0 ? "destructive" : "success"}
        />
        <StatTile
          icon={Tags}
          label="Sem categoria"
          value={String(semCategoria)}
          hint={semCategoria > 0 ? "a DRE ainda não fecha" : "tudo categorizado"}
          tone={semCategoria > 0 ? "warning" : "success"}
        />
      </div>

      {semCategoria > 0 ? (
        <p className="mb-4 text-sm text-on-warning-soft">
          {semCategoria} movimentação(ões) sem categoria ficam fora das linhas da DRE.{" "}
          <Link href="/extrato?sem=1" className="font-medium underline">
            Categorizar no extrato
          </Link>
        </p>
      ) : null}

      <TabelaMensal meses={mesesComDado} linhas={linhas} />
    </div>
  );
}
