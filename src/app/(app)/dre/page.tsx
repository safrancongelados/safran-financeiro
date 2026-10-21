import Link from "next/link";
import { BarChart3, Percent, Scale, Target, TrendingUp } from "lucide-react";
import {
  categoriasParaDre,
  contarSemCategoria,
  listarCentrosCusto,
  listarConexoesComContas,
  listarLinhasDre,
  mesesComMovimento,
  somasPorMesECategoria,
} from "@/db/queries/financeiro";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { indicadores, montarDre } from "@/lib/dre";
import { linhasDaDre } from "@/lib/dre-tabela";
import { UUID } from "@/lib/extrato-filtros";
import { intervaloDoPeriodo, lerPeriodo, mesAtual, mesesDoPeriodo, paramsDoPeriodo, rotuloPeriodo, type Periodo } from "@/lib/periodo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { TabelaMensal } from "@/components/tabela-mensal";
import { Chip, GrupoChips } from "@/components/chip";
import { SeletorPeriodo } from "@/components/seletor-periodo";

export const dynamic = "force-dynamic";
// Só leitura: se o banco travar, falha rápido e mostra "tentar de novo".
export const maxDuration = 30;

function hrefDre(periodo: Periodo, centro?: string, soTotais?: boolean) {
  const params = new URLSearchParams(paramsDoPeriodo(periodo));
  if (centro) params.set("centro", centro);
  if (soTotais) params.set("detalhe", "0");
  return `/dre?${params}`;
}

export default async function DrePage({ searchParams }: PageProps<"/dre">) {
  const params = await searchParams;
  const hoje = mesAtual();
  const periodo = lerPeriodo(params, hoje);
  const centro =
    typeof params.centro === "string" && (params.centro === "sem" || UUID.test(params.centro)) ? params.centro : undefined;
  const soTotais = params.detalhe === "0";
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);

  const [conexoes, linhasConfig, categorias, somas, semCategoria, centros, mesesComDado] = await Promise.all([
    listarConexoesComContas(),
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(inicio, fim, centro),
    contarSemCategoria(),
    listarCentrosCusto(),
    mesesComMovimento(),
  ]);
  const anos = [...new Set([Number(hoje.slice(0, 4)), ...mesesComDado.map((m) => Number(m.slice(0, 4)))])].sort((a, b) => b - a);

  const filtros = (
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
      <SeletorPeriodo base="/dre" periodo={periodo} anos={anos} extra={{ centro, detalhe: soTotais ? "0" : undefined }} />
      {centros.length > 0 ? (
        <GrupoChips rotulo="Centro de custo">
          {[
            { id: undefined, nome: "Todos" },
            ...centros.map((c) => ({ id: c.id as string | undefined, nome: c.nome })),
            { id: "sem", nome: "Sem centro" },
          ].map((c) => (
            <Chip key={c.id ?? "todos"} href={hrefDre(periodo, c.id, soTotais)} ativo={c.id === centro}>
              {c.nome}
            </Chip>
          ))}
        </GrupoChips>
      ) : null}
      <GrupoChips>
        <Chip href={hrefDre(periodo, centro, false)} ativo={!soTotais}>
          Com categorias
        </Chip>
        <Chip href={hrefDre(periodo, centro, true)} ativo={soTotais}>
          Só totais
        </Chip>
      </GrupoChips>
    </div>
  );

  if (conexoes.length === 0 || somas.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="DRE" description="Demonstração do resultado, mês a mês, pelo extrato da conta." />
        {conexoes.length > 0 ? filtros : null}
        <EmptyState
          icon={BarChart3}
          title={
            conexoes.length === 0
              ? "Conta ainda não conectada"
              : `Sem movimentações em ${rotuloPeriodo(periodo).toLowerCase()}${centro ? " neste centro" : ""}`
          }
          description={
            conexoes.length === 0
              ? "Conecte a conta da Safran. A DRE é montada a partir das movimentações categorizadas."
              : "Escolha outro período, outro centro ou sincronize o extrato."
          }
          actionHref={conexoes.length === 0 ? "/configuracoes/conexao" : "/extrato"}
          actionLabel={conexoes.length === 0 ? "Conectar banco" : "Ir para o extrato"}
        />
      </div>
    );
  }

  // Começa no primeiro mês com movimento: o Open Finance só traz cerca de um
  // ano de histórico, e colunas vazias antes disso só empurram a tabela.
  const primeiroComDado = somas.reduce((min, s) => (s.mes < min ? s.mes : min), meses[meses.length - 1]);
  const mesesVisiveis = meses.filter((m) => m >= primeiroComDado);
  const dre = montarDre(mesesVisiveis, linhasConfig, categorias, somas);

  const receita = dre.linhas.find((l) => l.linha.secao === "dre" && l.linha.tipo === "grupo");
  // Médias mensais sem o mês em andamento, que ainda não tem todos os custos.
  const ind = indicadores(dre, mesesVisiveis.filter((m) => m < hoje));
  const margem = ind.margem ?? dre.linhas.find((l) => l.linha.tipo === "subtotal" && l.linha.mostrarPercentual);
  const nomeCentro = centro === "sem" ? "sem centro" : centros.find((c) => c.id === centro)?.nome;
  // Filtrando por centro, a receita some e os percentuais e o equilíbrio perdem sentido.
  const comProporcoes = !centro && Boolean(dre.base);
  const cobreOsFixos =
    ind.pontoDeEquilibrio !== null && ind.receitaLiquidaMensal !== null ? ind.receitaLiquidaMensal >= ind.pontoDeEquilibrio : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={nomeCentro ? `DRE · ${nomeCentro}` : "DRE"}
        description="Regime de caixa: cada valor entra no mês em que passou pela conta. Clique num valor para ver os lançamentos; a estrutura se ajusta em Configurações."
      />

      {filtros}

      {/* O período está nos chips acima; os rótulos ficam curtos para o número caber. */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile compacto icon={TrendingUp} label={receita?.linha.nome ?? "Receita bruta"} value={formatarCentavos(receita?.total ?? 0)} />
        <StatTile
          compacto
          icon={Percent}
          label={margem?.linha.nome ?? "Margem de contribuição"}
          value={comProporcoes && margem ? formatarPercentual(margem.total, dre.base!.total) : "—"}
          hint={margem ? formatarCentavos(margem.total) : "marque o subtotal em Configurações"}
        />
        <StatTile
          compacto
          icon={Scale}
          label="Custos fixos"
          value={ind.custosFixos ? formatarCentavos(-ind.custosFixos.total) : "—"}
          hint={
            ind.custosFixos
              ? comProporcoes
                ? `${formatarPercentual(-ind.custosFixos.total, dre.base!.total)} da ${dre.base!.linha.nome.toLowerCase()}`
                : "entre a margem e o resultado operacional"
              : "marque os subtotais em Configurações"
          }
        />
        <StatTile
          compacto
          icon={Target}
          label="Ponto de equilíbrio mensal"
          value={comProporcoes && ind.pontoDeEquilibrio !== null ? formatarCentavos(ind.pontoDeEquilibrio) : "—"}
          hint={
            comProporcoes && ind.receitaLiquidaMensal !== null
              ? `${dre.base!.linha.nome.toLowerCase()} média: ${formatarCentavos(ind.receitaLiquidaMensal)} (${ind.meses} ${ind.meses === 1 ? "mês" : "meses"})`
              : "custos fixos mensais ÷ margem %"
          }
          tone={cobreOsFixos === null ? "default" : cobreOsFixos ? "success" : "warning"}
        />
        <StatTile
          compacto
          icon={BarChart3}
          label="Resultado líquido"
          value={formatarCentavos(dre.resultado.total)}
          hint={comProporcoes ? `${formatarPercentual(dre.resultado.total, dre.base!.total)} da ${dre.base!.linha.nome.toLowerCase()}` : undefined}
          tone={dre.resultado.total < 0 ? "destructive" : "success"}
        />
      </div>

      {semCategoria > 0 ? (
        <p className="mb-4 text-sm text-on-warning-soft">
          {semCategoria} movimentação(ões) sem categoria ficam fora das linhas da DRE.{" "}
          <Link href="/extrato?categoria=sem" className="font-medium underline">
            Categorizar no extrato
          </Link>
        </p>
      ) : null}

      <TabelaMensal
        meses={mesesVisiveis}
        mesDestaque={hoje}
        linhas={linhasDaDre(dre, { comPercentual: !centro, comCategorias: !soTotais })}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        A coluna do mês corrente está em destaque e ainda vai mudar até o fim do mês; as médias dos indicadores não a
        incluem. Ponto de equilíbrio = custos fixos mensais ÷ margem de contribuição %. Investimentos, empréstimos,
        sócios e transferências ficam fora da DRE e aparecem no fluxo de caixa.
      </p>
    </div>
  );
}
