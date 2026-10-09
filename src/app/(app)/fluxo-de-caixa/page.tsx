import Link from "next/link";
import { ChevronLeft, ChevronRight, Landmark, TrendingDown, Wallet } from "lucide-react";
import {
  categoriasParaDre,
  listarConexoesComContas,
  listarLinhasDre,
  saldoAtualDasContas,
  somasPorMesECategoria,
  variacaoPorMesDesde,
} from "@/db/queries/financeiro";
import { formatarCentavos } from "@/lib/dinheiro";
import { montarDre, saldosNoFimDoMes } from "@/lib/dre";
import { movimentoDoFluxo } from "@/lib/dre-tabela";
import { anoValido, mesAtual, mesesDoAno } from "@/lib/periodo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { TabelaMensal, type LinhaTabela } from "@/components/tabela-mensal";

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
  const { ano: anoParam } = await searchParams;
  const hoje = mesAtual();
  const anoCorrente = Number(hoje.slice(0, 4));
  const ano =
    typeof anoParam === "string" && anoValido(anoParam) && Number(anoParam) <= anoCorrente ? Number(anoParam) : anoCorrente;
  const meses = mesesDoAno(ano).filter((m) => m <= hoje);

  const [conexoes, linhasConfig, categorias, somas, variacao, saldo] = await Promise.all([
    listarConexoesComContas(),
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(`${ano}-01-01`, `${ano + 1}-01-01`),
    variacaoPorMesDesde(`${ano}-01-01`),
    saldoAtualDasContas(),
  ]);

  const navegacao = (
    <div className="flex items-center gap-1">
      <Link
        href={`/fluxo-de-caixa?ano=${ano - 1}`}
        aria-label="Ano anterior"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <p className="w-14 text-center text-sm font-semibold text-foreground">{ano}</p>
      {ano < anoCorrente ? (
        <Link
          href={`/fluxo-de-caixa?ano=${ano + 1}`}
          aria-label="Próximo ano"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
        >
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
        <PageHeader title="Fluxo de caixa" description="Quanto entrou, saiu e sobrou na conta, mês a mês" action={navegacao} />
        <EmptyState
          icon={Landmark}
          title={conexoes.length === 0 ? "Conta ainda não conectada" : `Sem movimentações em ${ano}`}
          description={
            conexoes.length === 0 ? "Conecte a conta da Safran no Extrato." : "Escolha outro ano ou sincronize o extrato."
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
  const dre = montarDre(mesesComDado, linhasConfig, categorias, somas);
  const saldoFinal = saldosNoFimDoMes(saldo.saldoCentavos, variacao, mesesComDado, hoje);
  const saldoInicial = Object.fromEntries(
    mesesComDado.map((m) => [m, saldoFinal[m] === null ? null : saldoFinal[m]! - (dre.variacaoCaixa.porMes[m] ?? 0)])
  );
  const primeiro = mesesComDado[0];
  const ultimo = mesesComDado[mesesComDado.length - 1];
  const finais = mesesComDado.map((m) => saldoFinal[m]).filter((v): v is number => v !== null);
  const menorSaldo = Math.min(...finais);
  const mesMenorSaldo = mesesComDado.find((m) => saldoFinal[m] === menorSaldo);

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
        action={navegacao}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          label="Saldo hoje"
          value={formatarCentavos(saldo.saldoCentavos)}
          hint={saldo.atualizadoEm ? `banco em ${DATA_HORA.format(saldo.atualizadoEm)}` : undefined}
        />
        <StatTile
          icon={Landmark}
          label={`Variação em ${ano}`}
          value={formatarCentavos(dre.variacaoCaixa.total)}
          tone={dre.variacaoCaixa.total < 0 ? "destructive" : "success"}
        />
        <StatTile
          icon={TrendingDown}
          label="Menor saldo de fim de mês"
          value={formatarCentavos(menorSaldo)}
          hint={mesMenorSaldo ? `em ${mesMenorSaldo.slice(5)}/${mesMenorSaldo.slice(0, 4)}` : undefined}
          tone={menorSaldo < 0 ? "destructive" : "default"}
        />
      </div>

      <TabelaMensal meses={mesesComDado} linhas={linhas} />

      <p className="mt-3 text-xs text-muted-foreground">
        O saldo de cada mês é o saldo de hoje menos o que entrou e saiu depois. Pequena diferença para o extrato do banco
        vem de lançamentos ainda pendentes, que só entram aqui quando efetivados.
      </p>
    </div>
  );
}
