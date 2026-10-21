import Link from "next/link";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpRight,
  Landmark,
  Scale,
  Settings,
  Tags,
} from "lucide-react";
import {
  listarCategorias,
  listarCentrosCusto,
  listarConexoesComContas,
  listarLinhasDre,
  listarMovimentacoesDoMes,
  mesesComMovimento,
  totaisDoMes,
} from "@/db/queries/financeiro";
import { formatarCentavos } from "@/lib/dinheiro";
import { agruparIguais, formatarDocumento, statusConexao } from "@/lib/extrato";
import {
  alternarOrdem,
  hrefExtrato,
  lerFiltroExtrato,
  ordemEmVigor,
  temFiltro,
  type FiltroExtrato,
  type OrdemExtrato,
} from "@/lib/extrato-filtros";
import { opcoesDeCategoria, opcoesDeCentro } from "@/lib/opcoes";
import { mesAtual, mesValido, rotuloDia, rotuloMes } from "@/lib/periodo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { Chip, GrupoChips } from "@/components/chip";
import { SincronizarButton } from "@/components/conexao/sincronizar-button";
import { ConectarBancoButton } from "@/components/conexao/conectar-banco";
import { cn } from "@/lib/utils";
import { FiltrosExtrato } from "./filtros-extrato";
import { CategoriaSelect, CentroSelect, NomeEditavel } from "./edicao-linha";

export const dynamic = "force-dynamic";
// As actions desta página rodam o sync, que chama a Pluggy conta por conta.
export const maxDuration = 60;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

/** Cabeçalho de coluna que ordena: clique ordena por ela; de novo, inverte. */
function CabecalhoOrdenavel({
  filtro,
  ordem,
  children,
  className,
}: {
  filtro: FiltroExtrato;
  ordem: OrdemExtrato;
  children: React.ReactNode;
  className?: string;
}) {
  const vigente = ordemEmVigor(filtro);
  const ativo = vigente.ordem === ordem;
  const Seta = vigente.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <Link
        href={hrefExtrato(alternarOrdem(filtro, ordem))}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 rounded hover:text-foreground",
          ativo && "text-foreground",
          className?.includes("text-right") && "flex-row-reverse"
        )}
        title={`Ordenar por ${String(children).toLowerCase()}`}
      >
        {children}
        <Seta className={cn("size-3", ativo ? "opacity-100" : "opacity-0")} />
      </Link>
    </TableHead>
  );
}

export default async function ExtratoPage({ searchParams }: PageProps<"/extrato">) {
  const params = await searchParams;
  const hoje = mesAtual();
  const filtro = lerFiltroExtrato(params, hoje, mesValido);
  const { mes } = filtro;

  const conexoes = await listarConexoesComContas();

  if (conexoes.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Extrato" description="Movimentações da conta da Safran, via Open Finance." />
        <EmptyState
          icon={Landmark}
          title="Conta ainda não conectada"
          description="Conecte a conta da Safran pelo Open Finance, com o login de quem acessa a conta da empresa. O extrato é puxado na hora e, depois, todo dia."
          actionHref="/configuracoes/conexao"
          actionLabel="Conectar banco"
        />
      </div>
    );
  }

  const [linhas, categorias, linhasDre, centros, meses, totais] = await Promise.all([
    listarMovimentacoesDoMes(filtro),
    listarCategorias(),
    listarLinhasDre(),
    listarCentrosCusto(),
    mesesComMovimento(),
    totaisDoMes(mes),
  ]);
  const contas = conexoes.flatMap((c) => c.contas);
  const opcoes = opcoesDeCategoria(linhasDre, categorias);
  const opcoesCentro = opcoesDeCentro(centros);
  const filtrando = temFiltro(filtro);
  const porNome = filtro.visao === "nomes";

  // O que o filtro deixou passar.
  const doCaixa = linhas.filter((l) => l.contaTipo === "BANK" && l.categoriaSecao !== "transferencia");
  const entradasFiltro = doCaixa.filter((l) => l.valorCentavos > 0).reduce((acc, l) => acc + l.valorCentavos, 0);
  const saidasFiltro = doCaixa.filter((l) => l.valorCentavos < 0).reduce((acc, l) => acc + l.valorCentavos, 0);
  const grupos = porNome ? agruparIguais(linhas) : [];

  const saldoDoMes = totais.entradasCentavos + totais.saidasCentavos;
  const conexoesComAviso = conexoes.map((c) => ({ conexao: c, st: statusConexao(c.status) })).filter((c) => c.st.acao);
  const principal = conexoes[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Extrato"
        description={
          principal.dadosAtualizadosEm
            ? `${principal.instituicao ?? "Banco"} · banco consultado em ${DATA_HORA.format(principal.dadosAtualizadosEm)}${principal.ultimoSyncEm ? ` · sync em ${DATA_HORA.format(principal.ultimoSyncEm)}` : ""}`
            : `${principal.instituicao ?? "Banco"} · banco ainda não consultado`
        }
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/configuracoes/conexao">
                <Settings className="size-4" /> Conexão
              </Link>
            </Button>
            <SincronizarButton />
          </div>
        }
      />

      {conexoesComAviso.map(({ conexao, st }) => (
        <Card key={conexao.id} className="mb-5 flex-row flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning-soft/40 px-4 py-3">
          <p className="text-sm text-on-warning-soft">
            <span className="font-semibold">{conexao.instituicao ?? "Banco"}:</span> {st.acao}
          </p>
          {st.reconectar ? <ConectarBancoButton itemId={conexao.providerItemId} variant="secondary" /> : null}
        </Card>
      ))}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ArrowDownLeft} label="Entradas no mês" value={formatarCentavos(totais.entradasCentavos)} tone="success" />
        <StatTile icon={ArrowUpRight} label="Saídas no mês" value={formatarCentavos(-totais.saidasCentavos)} />
        <StatTile
          icon={Scale}
          label="Saldo do mês"
          value={formatarCentavos(saldoDoMes)}
          hint="entradas menos saídas"
          tone={saldoDoMes < 0 ? "destructive" : "success"}
        />
        <StatTile
          icon={Tags}
          label="Sem categoria no mês"
          value={String(totais.semCategoria)}
          hint={totais.semCategoria > 0 ? "clique para ver só essas" : "tudo categorizado"}
          tone={totais.semCategoria > 0 ? "warning" : "success"}
          href={totais.semCategoria > 0 ? hrefExtrato({ mes, categoria: "sem", visao: filtro.visao }) : undefined}
        />
      </div>

      <FiltrosExtrato
        filtro={filtro}
        mesCorrente={hoje}
        meses={[...meses].reverse()}
        categorias={opcoes}
        centros={opcoesCentro}
        contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <GrupoChips>
          <Chip href={hrefExtrato({ ...filtro, visao: undefined })} ativo={!porNome}>
            Lançamentos
          </Chip>
          <Chip href={hrefExtrato({ ...filtro, visao: "nomes" })} ativo={porNome}>
            Por nome
          </Chip>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Chip
            href={hrefExtrato({ ...filtro, categoria: filtro.categoria === "sem" ? undefined : "sem" })}
            ativo={filtro.categoria === "sem"}
          >
            Só sem categoria
          </Chip>
        </GrupoChips>
        <p className="text-xs text-muted-foreground">
          {porNome ? `${grupos.length} nome(s) · ` : ""}
          {linhas.length} lançamento(s){filtrando ? " nesta seleção" : ` em ${rotuloMes(mes).toLowerCase()}`}
          {linhas.length > 0 ? (
            <>
              {" "}· <span className="text-on-success-soft">{formatarCentavos(entradasFiltro)}</span> entradas ·{" "}
              <span className="text-foreground">{formatarCentavos(-saidasFiltro)}</span> saídas
            </>
          ) : null}
        </p>
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={filtrando ? "Nada com esses filtros" : "Nenhuma movimentação neste mês"}
          description={
            filtrando
              ? "Tire um filtro ou mude a busca. O resumo acima é do mês inteiro."
              : "Se o banco foi conectado agora, o histórico disponível no Open Finance já foi puxado — confira os meses anteriores."
          }
          actionHref={filtrando ? hrefExtrato({ mes, visao: filtro.visao }) : undefined}
          actionLabel={filtrando ? "Limpar filtros" : undefined}
        />
      ) : porNome ? (
        <Card className="overflow-hidden py-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Categoria e centro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.exemplo.id}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <NomeEditavel
                      key={`${g.exemplo.id}-${g.exemplo.nomeExibicao ?? ""}`}
                      movimentacaoId={g.exemplo.id}
                      descricao={g.descricao}
                      nomeExibicao={g.exemplo.nomeExibicao}
                    />
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {g.exemplo.contraparte ?? null}
                      {g.exemplo.contraparteDocumento ? (
                        <span className="ml-1 font-mono">{formatarDocumento(g.exemplo.contraparteDocumento)}</span>
                      ) : null}
                      {!g.exemplo.contraparte && !g.exemplo.contraparteDocumento ? "sem contraparte" : null}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Link
                      href={hrefExtrato({ ...filtro, visao: undefined, q: g.busca })}
                      scroll={false}
                      className="text-foreground underline-offset-2 hover:underline"
                      title="Ver os lançamentos"
                    >
                      {g.quantidade}
                    </Link>
                    <span className="block text-xs text-muted-foreground">último em {rotuloDia(g.ultimaData)}</span>
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-medium tabular-nums", g.totalCentavos > 0 ? "text-on-success-soft" : "text-foreground")}
                  >
                    {formatarCentavos(g.totalCentavos)}
                  </TableCell>
                  <TableCell>
                    <CategoriaSelect
                      key={`${g.exemplo.id}-${g.exemplo.categoriaId ?? "sem"}-${g.exemplo.categorizadaPor ?? ""}`}
                      movimentacaoId={g.exemplo.id}
                      categoriaId={g.exemplo.categoriaId}
                      categoriaNome={g.exemplo.categoriaNome}
                      origem={g.exemplo.categorizadaPor}
                      regraId={g.exemplo.regraId}
                      opcoes={opcoes}
                      permitirSoNesta={false}
                    />
                    {g.exemplo.categoriaId ? (
                      <CentroSelect
                        key={`${g.exemplo.id}-${g.exemplo.centroCustoId ?? ""}-${g.exemplo.categoriaCentroId ?? ""}`}
                        movimentacaoId={g.exemplo.id}
                        centroId={g.exemplo.centroCustoId}
                        centroPadraoId={g.exemplo.categoriaCentroId}
                        centros={opcoesCentro}
                      />
                    ) : null}
                    {g.semCategoria > 0 && g.semCategoria < g.quantidade ? (
                      <p className="mt-1 text-xs text-on-warning-soft">{g.semCategoria} sem categoria</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <CabecalhoOrdenavel filtro={filtro} ordem="data">
                  Data
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel filtro={filtro} ordem="nome">
                  Nome
                </CabecalhoOrdenavel>
                <TableHead>Contraparte</TableHead>
                <TableHead>Categoria e centro</TableHead>
                <CabecalhoOrdenavel filtro={filtro} ordem="valor" className="text-right">
                  Valor
                </CabecalhoOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{rotuloDia(l.data)}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <NomeEditavel
                      // Remonta quando a edição de uma linha igual renomeia esta no servidor.
                      key={`${l.id}-${l.nomeExibicao ?? ""}`}
                      movimentacaoId={l.id}
                      descricao={l.descricao}
                      nomeExibicao={l.nomeExibicao}
                    />
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {l.meio ? <Badge variant="secondary">{l.meio}</Badge> : null}
                      {l.contaTipo === "CREDIT" ? <Badge variant="sky">Cartão</Badge> : null}
                      {contas.length > 1 ? <span className="text-xs text-muted-foreground">{l.contaNome}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-muted-foreground">
                    {l.contraparte ?? "—"}
                    {l.contraparteDocumento ? (
                      <span className="block font-mono text-xs">{formatarDocumento(l.contraparteDocumento)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <CategoriaSelect
                      // A chave muda junto com a categoria: quando a edição de
                      // uma linha igual recategoriza esta no servidor, o
                      // seletor remonta com o valor novo em vez de manter o antigo.
                      key={`${l.id}-${l.categoriaId ?? "sem"}-${l.categorizadaPor ?? ""}`}
                      movimentacaoId={l.id}
                      categoriaId={l.categoriaId}
                      categoriaNome={l.categoriaNome}
                      origem={l.categorizadaPor}
                      regraId={l.regraId}
                      opcoes={opcoes}
                    />
                    {l.categoriaId ? (
                      <CentroSelect
                        key={`${l.id}-${l.centroCustoId ?? ""}-${l.categoriaCentroId ?? ""}`}
                        movimentacaoId={l.id}
                        centroId={l.centroCustoId}
                        centroPadraoId={l.categoriaCentroId}
                        centros={opcoesCentro}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      l.valorCentavos > 0 ? "text-on-success-soft" : "text-foreground"
                    )}
                  >
                    {formatarCentavos(l.valorCentavos)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
