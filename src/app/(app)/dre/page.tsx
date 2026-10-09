import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, Percent, Tags, TrendingUp } from "lucide-react";
import {
  categoriasParaDre,
  contarSemCategoria,
  listarCentrosCusto,
  listarConexoesComContas,
  listarLinhasDre,
  somasPorMesECategoria,
} from "@/db/queries/financeiro";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { montarDre } from "@/lib/dre";
import { linhasDaDre } from "@/lib/dre-tabela";
import { anoValido, mesAtual, mesesDoAno } from "@/lib/periodo";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { TabelaMensal } from "@/components/tabela-mensal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// Só leitura: se o banco travar, falha rápido e mostra "tentar de novo".
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hrefDre(ano: number, centro?: string) {
  const params = new URLSearchParams({ ano: String(ano) });
  if (centro) params.set("centro", centro);
  return `/dre?${params}`;
}

export default async function DrePage({ searchParams }: PageProps<"/dre">) {
  const { ano: anoParam, centro: centroParam } = await searchParams;
  const hoje = mesAtual();
  const anoCorrente = Number(hoje.slice(0, 4));
  const ano =
    typeof anoParam === "string" && anoValido(anoParam) && Number(anoParam) <= anoCorrente ? Number(anoParam) : anoCorrente;
  const centro =
    typeof centroParam === "string" && (centroParam === "sem" || UUID.test(centroParam)) ? centroParam : undefined;
  // Mês que ainda não chegou não tem coluna.
  const meses = mesesDoAno(ano).filter((m) => m <= hoje);

  const [conexoes, linhasConfig, categorias, somas, semCategoria, centros] = await Promise.all([
    listarConexoesComContas(),
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(`${ano}-01-01`, `${ano + 1}-01-01`, centro),
    contarSemCategoria(),
    listarCentrosCusto(),
  ]);

  const navegacao = (
    <div className="flex items-center gap-1">
      <Link href={hrefDre(ano - 1, centro)} aria-label="Ano anterior" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
        <ChevronLeft className="size-4" />
      </Link>
      <p className="w-14 text-center text-sm font-semibold text-foreground">{ano}</p>
      {ano < anoCorrente ? (
        <Link href={hrefDre(ano + 1, centro)} aria-label="Próximo ano" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="p-1.5 text-muted-foreground/30">
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );

  const filtros =
    centros.length > 0 ? (
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Centro de custo:</span>
        {[{ id: undefined, nome: "Todos" }, ...centros.map((c) => ({ id: c.id as string | undefined, nome: c.nome })), { id: "sem", nome: "Sem centro" }].map(
          (c) => (
            <Link
              key={c.id ?? "todos"}
              href={hrefDre(ano, c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                c.id === centro
                  ? "border-primary bg-primary-soft text-on-primary-soft"
                  : "border-border text-muted-foreground hover:bg-secondary"
              )}
            >
              {c.nome}
            </Link>
          )
        )}
      </div>
    ) : null;

  if (conexoes.length === 0 || somas.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="DRE" description="Demonstração do resultado, mês a mês, pelo extrato da conta" action={navegacao} />
        {filtros}
        <EmptyState
          icon={BarChart3}
          title={conexoes.length === 0 ? "Conta ainda não conectada" : `Sem movimentações em ${ano}${centro ? " neste centro" : ""}`}
          description={
            conexoes.length === 0
              ? "Conecte a conta da Safran no Extrato. A DRE é montada a partir das movimentações categorizadas."
              : "Escolha outro ano, outro centro ou sincronize o extrato."
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

  const receita = dre.linhas.find((l) => l.linha.secao === "dre" && l.linha.tipo === "grupo");
  const margem = dre.linhas.find((l) => l.linha.tipo === "subtotal" && l.linha.mostrarPercentual);
  const nomeCentro = centro === "sem" ? "sem centro" : centros.find((c) => c.id === centro)?.nome;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={nomeCentro ? `DRE · ${nomeCentro}` : "DRE"}
        description="Regime de caixa: cada valor entra no mês em que passou pela conta. A estrutura (linhas, categorias e centros) se ajusta em Configurações."
        action={navegacao}
      />

      {filtros}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={TrendingUp}
          label={`${receita?.linha.nome ?? "Receita"} ${ano}`}
          value={formatarCentavos(receita?.total ?? 0)}
        />
        <StatTile
          icon={Percent}
          label={margem?.linha.nome ?? "Margem"}
          value={!centro && margem && dre.base ? formatarPercentual(margem.total, dre.base.total) : "—"}
          hint={margem ? formatarCentavos(margem.total) : undefined}
        />
        <StatTile
          icon={BarChart3}
          label={`Resultado ${ano}`}
          value={formatarCentavos(dre.resultado.total)}
          tone={dre.resultado.total < 0 ? "destructive" : "success"}
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

      <TabelaMensal meses={mesesComDado} linhas={linhasDaDre(dre, { comPercentual: !centro })} />
    </div>
  );
}
