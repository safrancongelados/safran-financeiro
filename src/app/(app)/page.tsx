import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CircleAlert,
  Landmark,
  Receipt,
  Tags,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  categoriasParaDre,
  contarSemCategoria,
  listarConexoesComContas,
  listarLinhasDre,
  listarMovimentacoesRecentes,
  mixPorMes,
  saldoAtualDasContas,
  somasAteODia,
  somasPorMesECategoria,
} from "@/db/queries/financeiro";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { indicadores, montarDre } from "@/lib/dre";
import { statusConexao } from "@/lib/extrato";
import { deslocarMes, hojeISO, rotuloDia, rotuloMes, rotuloMesCurto, ultimosMeses } from "@/lib/periodo";
import { maioresDespesas, numerosDoMes, serieDoGrafico, variacaoRelativa } from "@/lib/resumo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile, type Delta } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraficoMeses, LegendaGrafico } from "@/components/grafico-meses";
import { SincronizarButton } from "@/components/conexao/sincronizar-button";
import { ConectarBancoButton } from "@/components/conexao/conectar-banco";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// O botão de sincronizar chama a Pluggy conta por conta.
export const maxDuration = 60;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

function formatarVariacao(v: number): string {
  const pct = Math.abs(v * 100).toFixed(v < 0.1 ? 1 : 0).replace(".", ",");
  return `${v >= 0 ? "+" : "−"}${pct}%`;
}

/** Diferença em reais, com sinal explícito. */
function formatarDiferenca(centavos: number): string {
  return `${centavos >= 0 ? "+" : "−"}${formatarCentavos(Math.abs(centavos))}`;
}

/** Dias entre duas datas YYYY-MM-DD. */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export default async function InicioPage() {
  const hoje = hojeISO();
  const mes = hoje.slice(0, 7);
  const dia = Number(hoje.slice(8, 10));
  const mesAnterior = deslocarMes(mes, -1);
  const meses = ultimosMeses(12, mes);

  const conexoes = await listarConexoesComContas();
  if (conexoes.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Início" description="O resumo do mês da Safran, a partir do extrato da conta." />
        <EmptyState
          icon={Landmark}
          title="Conta ainda não conectada"
          description="Conecte a conta da Safran pelo Open Finance. O extrato é puxado na hora, e a DRE e o fluxo de caixa saem dele."
          actionHref="/configuracoes/conexao"
          actionLabel="Conectar banco"
        />
      </div>
    );
  }

  const [linhasConfig, categorias, somas, somasAnterior, saldo, semCategoria, recentes, mix] = await Promise.all([
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(`${meses[0]}-01`, `${deslocarMes(mes, 1)}-01`),
    somasAteODia(mesAnterior, dia),
    saldoAtualDasContas(),
    contarSemCategoria(),
    listarMovimentacoesRecentes(8),
    mixPorMes(`${meses[0]}-01`, `${deslocarMes(mes, 1)}-01`),
  ]);

  const dre = montarDre(meses, linhasConfig, categorias, somas, mix);
  const dreAnterior = montarDre([mesAnterior], linhasConfig, categorias, somasAnterior, mix);
  const atual = numerosDoMes(dre, mes);
  const anterior = numerosDoMes(dreAnterior, mesAnterior);
  const despesas = maioresDespesas(dre, mes);
  const pontos = serieDoGrafico(dre);
  // Ponto de equilíbrio em receita bruta, pelas médias dos meses fechados.
  const ind = indicadores(dre, meses.filter((m) => m < mes));
  const equilibrio = ind.pontoDeEquilibrioBruto !== null && ind.pontoDeEquilibrioBruto > 0 ? ind.pontoDeEquilibrioBruto : null;
  const ultimaData = recentes[0]?.data ?? null;
  const comparacao = `vs ${rotuloMesCurto(mesAnterior).toLowerCase()} até dia ${dia}`;

  const varReceita = variacaoRelativa(atual.receita, anterior.receita);
  const deltaReceita: Delta | undefined =
    varReceita === null
      ? undefined
      : { texto: `${formatarVariacao(varReceita)} ${comparacao}`, tom: varReceita >= 0 ? "success" : "destructive" };
  const difResultado = atual.resultado - anterior.resultado;
  const deltaResultado: Delta = {
    texto: `${formatarDiferenca(difResultado)} ${comparacao}`,
    tom: difResultado > 0 ? "success" : difResultado < 0 ? "destructive" : "muted",
  };

  // Pendências: o que precisa de alguém.
  const pendencias: { texto: string; href: string; acao: string; grave?: boolean }[] = [];
  for (const c of conexoes) {
    const st = statusConexao(c.status);
    if (st.acao) {
      pendencias.push({ texto: `${c.instituicao ?? "Banco"}: ${st.acao}`, href: "/configuracoes/conexao", acao: "Ver conexão", grave: true });
    }
    if (c.ultimoSyncOk === false) {
      pendencias.push({ texto: `${c.instituicao ?? "Banco"}: o último sync falhou (${c.ultimoSyncDetalhe ?? "sem detalhe"}).`, href: "/configuracoes/conexao", acao: "Ver conexão", grave: true });
    }
  }
  if (ultimaData && diasEntre(ultimaData, hoje) >= 4) {
    pendencias.push({
      texto: `Nenhum lançamento novo desde ${rotuloDia(ultimaData)}. Se houve movimento na conta, sincronize ou confira a conexão.`,
      href: "/configuracoes/conexao",
      acao: "Ver conexão",
    });
  }
  if (semCategoria > 0) {
    pendencias.push({
      texto: `${semCategoria} lançamento(s) sem categoria ficam fora das linhas da DRE.`,
      href: "/extrato?categoria=sem",
      acao: "Categorizar",
    });
  }

  const totalDespesas = despesas.reduce((acc, d) => acc + d.centavos, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Início"
        description={`${rotuloMes(mes)} · ${ultimaData ? `extrato até ${rotuloDia(ultimaData)}` : "sem lançamentos ainda"}`}
        action={<SincronizarButton />}
      />

      {pendencias.length > 0 ? (
        <Card className="mb-5 border-warning/40 bg-warning-soft/40 py-0">
          <ul className="divide-y divide-warning/20">
            {pendencias.map((p) => (
              <li key={p.texto} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="flex items-start gap-2 text-on-warning-soft">
                  <CircleAlert className={cn("mt-0.5 size-4 shrink-0", p.grave ? "text-destructive" : "text-warning")} />
                  {p.texto}
                </span>
                <Link href={p.href} className="inline-flex items-center gap-1 text-xs font-semibold text-on-warning-soft underline-offset-2 hover:underline">
                  {p.acao} <ArrowRight className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          label="Saldo em conta"
          value={formatarCentavos(saldo.saldoCentavos)}
          hint={saldo.atualizadoEm ? `banco em ${DATA_HORA.format(saldo.atualizadoEm)}` : "ainda sem consulta ao banco"}
          tone={saldo.saldoCentavos < 0 ? "destructive" : "default"}
        />
        <StatTile icon={TrendingUp} label="Receita no mês" value={formatarCentavos(atual.receita)} delta={deltaReceita} />
        <StatTile
          icon={BarChart3}
          label="Resultado no mês"
          value={formatarCentavos(atual.resultado)}
          delta={deltaResultado}
          hint={atual.base ? `${formatarPercentual(atual.resultado, atual.base)} da receita líquida` : undefined}
          tone={atual.resultado < 0 ? "destructive" : "success"}
        />
        <StatTile
          icon={Tags}
          label="Sem categoria"
          value={String(semCategoria)}
          hint={semCategoria > 0 ? "clique para categorizar" : "tudo categorizado"}
          tone={semCategoria > 0 ? "warning" : "success"}
          href={semCategoria > 0 ? "/extrato?categoria=sem" : undefined}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="gap-4 lg:col-span-2">
          <CardHeader className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Últimos 12 meses</CardTitle>
              <CardDescription>Receita bruta e resultado líquido, em reais, pelo regime de caixa.</CardDescription>
            </div>
            <LegendaGrafico comReferencia={equilibrio !== null} />
          </CardHeader>
          <CardContent className="pt-0">
            <GraficoMeses
              pontos={pontos}
              mesParcial={mes}
              referencia={equilibrio !== null ? { valor: equilibrio, rotulo: "equilíbrio" } : undefined}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {equilibrio !== null && ind.custosFixosMensais !== null && ind.margemSobreBase !== null
                  ? `Ponto de equilíbrio: ${formatarCentavos(equilibrio)} de receita bruta por mês (custos fixos de ${formatarCentavos(ind.custosFixosMensais)}/mês, margem de ${formatarPercentual(ind.margemSobreBase, 1)}).`
                  : null}
              </span>
              <Link href="/dre?periodo=12m" className="font-medium text-primary underline-offset-2 hover:underline">
                Ver a DRE mês a mês
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Maiores despesas do mês</CardTitle>
            <CardDescription>
              {despesas.length > 0
                ? `As ${despesas.length} categorias que mais pesaram em ${rotuloMesCurto(mes).toLowerCase()}, e a fração de tudo que saiu.`
                : "Nenhuma despesa categorizada neste mês ainda."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-3">
              {despesas.map((d) => (
                <li key={d.categoriaId}>
                  <Link href={`/extrato?mes=${mes}&categoria=${d.categoriaId}`} className="group block">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-foreground group-hover:underline">{d.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatarCentavos(-d.centavos)} <span className="text-xs">· {Math.round(d.parte * 100)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-primary-soft">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, d.parte * 100)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {despesas.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Estas {despesas.length}: {formatarCentavos(-totalDespesas)}.{" "}
                <Link href={`/dre`} className="font-medium text-primary underline-offset-2 hover:underline">
                  Ver todas na DRE
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <CardTitle>Últimos lançamentos</CardTitle>
              <CardDescription className="mt-1">O que passou pela conta mais recentemente.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/extrato">
                Extrato <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          {recentes.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">Nenhuma movimentação ainda. Sincronize o extrato.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentes.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{rotuloDia(m.data)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{m.nomeExibicao ?? m.descricao}</span>
                  <span className="hidden shrink-0 sm:block">
                    {m.categoriaNome ? (
                      <Badge variant="secondary">{m.categoriaNome}</Badge>
                    ) : (
                      <Badge variant="warning">sem categoria</Badge>
                    )}
                  </span>
                  <span className={cn("w-28 shrink-0 text-right tabular-nums", m.valorCentavos > 0 ? "text-on-success-soft" : "text-foreground")}>
                    {formatarCentavos(m.valorCentavos)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Conexão com o banco</CardTitle>
            <CardDescription>Sincroniza todo dia às 07:00 e a cada aviso do banco.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {conexoes.map((c) => {
              const st = statusConexao(c.status);
              return (
                <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Landmark className="size-4 text-muted-foreground" />
                      {c.instituicao ?? "Banco"}
                    </span>
                    <Badge variant={st.tom}>{st.label}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {c.dadosAtualizadosEm ? `Banco consultado em ${DATA_HORA.format(c.dadosAtualizadosEm)}` : "Banco ainda não consultado"}
                    {c.ultimoSyncEm ? ` · sync em ${DATA_HORA.format(c.ultimoSyncEm)}` : null}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {c.contas.map((conta) => (
                      <li key={conta.id} className="flex justify-between gap-2">
                        <span className="truncate">{conta.nome}</span>
                        <span className="shrink-0 tabular-nums text-foreground">{formatarCentavos(conta.saldoCentavos)}</span>
                      </li>
                    ))}
                  </ul>
                  {st.reconectar ? (
                    <div className="mt-3">
                      <ConectarBancoButton itemId={c.providerItemId} variant="secondary" />
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/configuracoes/conexao">
                <Receipt className="size-3.5" /> Gerenciar conexão
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
