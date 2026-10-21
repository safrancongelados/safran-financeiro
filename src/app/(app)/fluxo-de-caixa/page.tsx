import { Landmark, TrendingDown, Wallet } from "lucide-react";
import {
  categoriasParaDre,
  listarConexoesComContas,
  listarLinhasDre,
  mesesComMovimento,
  saldoAtualDasContas,
  somasPorMesECategoria,
  variacaoPorMesDesde,
} from "@/db/queries/financeiro";
import { formatarCentavos } from "@/lib/dinheiro";
import { montarDre, saldosNoFimDoMes } from "@/lib/dre";
import { movimentoDoFluxo } from "@/lib/dre-tabela";
import { intervaloDoPeriodo, lerPeriodo, mesAtual, mesesDoPeriodo, rotuloMesAno, rotuloPeriodo } from "@/lib/periodo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { TabelaMensal, type LinhaTabela } from "@/components/tabela-mensal";
import { SeletorPeriodo } from "@/components/seletor-periodo";

export const dynamic = "force-dynamic";
// Só leitura: se o banco travar, falha rápido e mostra "tentar de novo".
export const maxDuration = 30;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

export default async function FluxoDeCaixaPage({ searchParams }: PageProps<"/fluxo-de-caixa">) {
  const params = await searchParams;
  const hoje = mesAtual();
  const periodo = lerPeriodo(params, hoje);
  const meses = mesesDoPeriodo(periodo, hoje);
  const { inicio, fim } = intervaloDoPeriodo(periodo, hoje);

  const [conexoes, linhasConfig, categorias, somas, variacao, saldo, mesesComDado] = await Promise.all([
    listarConexoesComContas(),
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(inicio, fim),
    variacaoPorMesDesde(inicio),
    saldoAtualDasContas(),
    mesesComMovimento(),
  ]);
  const anos = [...new Set([Number(hoje.slice(0, 4)), ...mesesComDado.map((m) => Number(m.slice(0, 4)))])].sort((a, b) => b - a);
  const seletor = (
    <div className="mb-5">
      <SeletorPeriodo base="/fluxo-de-caixa" periodo={periodo} anos={anos} />
    </div>
  );

  if (conexoes.length === 0 || somas.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Fluxo de caixa" description="Quanto entrou, saiu e sobrou na conta, mês a mês." />
        {conexoes.length > 0 ? seletor : null}
        <EmptyState
          icon={Landmark}
          title={conexoes.length === 0 ? "Conta ainda não conectada" : `Sem movimentações em ${rotuloPeriodo(periodo).toLowerCase()}`}
          description={conexoes.length === 0 ? "Conecte a conta da Safran." : "Escolha outro período ou sincronize o extrato."}
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
  const saldoFinal = saldosNoFimDoMes(saldo.saldoCentavos, variacao, mesesVisiveis, hoje);
  const saldoInicial = Object.fromEntries(
    mesesVisiveis.map((m) => [m, saldoFinal[m] === null ? null : saldoFinal[m]! - (dre.variacaoCaixa.porMes[m] ?? 0)])
  );
  const primeiro = mesesVisiveis[0];
  const ultimo = mesesVisiveis[mesesVisiveis.length - 1];
  const finais = mesesVisiveis.map((m) => saldoFinal[m]).filter((v): v is number => v !== null);
  const menorSaldo = Math.min(...finais);
  const mesMenorSaldo = mesesVisiveis.find((m) => saldoFinal[m] === menorSaldo);
  const rotulo = rotuloPeriodo(periodo).toLowerCase();

  const linhas: LinhaTabela[] = [
    { tipo: "saldo", label: "Saldo inicial", porMes: saldoInicial, total: saldoInicial[primeiro] },
    { tipo: "secao", label: "Movimento do mês" },
    ...movimentoDoFluxo(dre),
    { tipo: "subtotal", label: "= Variação do mês", serie: dre.variacaoCaixa },
    { tipo: "saldo", label: "Saldo final", porMes: saldoFinal, total: saldoFinal[ultimo] },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Fluxo de caixa"
        description="Quanto entrou, saiu e sobrou na conta, mês a mês. Os saldos partem do saldo de hoje no banco."
      />

      {seletor}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          label="Saldo hoje"
          value={formatarCentavos(saldo.saldoCentavos)}
          hint={saldo.atualizadoEm ? `banco em ${DATA_HORA.format(saldo.atualizadoEm)}` : undefined}
        />
        <StatTile
          icon={Landmark}
          label={`Variação · ${rotulo}`}
          value={formatarCentavos(dre.variacaoCaixa.total)}
          tone={dre.variacaoCaixa.total < 0 ? "destructive" : "success"}
        />
        <StatTile
          icon={TrendingDown}
          label="Menor saldo de fim de mês"
          value={formatarCentavos(menorSaldo)}
          hint={mesMenorSaldo ? `em ${rotuloMesAno(mesMenorSaldo)}` : undefined}
          tone={menorSaldo < 0 ? "destructive" : "default"}
        />
      </div>

      <TabelaMensal meses={mesesVisiveis} mesDestaque={hoje} linhas={linhas} />

      <p className="mt-3 text-xs text-muted-foreground">
        O saldo de cada mês é o saldo de hoje menos o que entrou e saiu depois. Pequena diferença para o extrato do banco
        vem de lançamentos ainda pendentes, que só entram aqui quando efetivados.
      </p>
    </div>
  );
}
