import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Landmark, Tags, Wallet, X } from "lucide-react";
import { listarCategorias, listarConexoesComContas, listarMovimentacoesDoMes } from "@/db/queries/financeiro";
import { formatarCentavos } from "@/lib/dinheiro";
import { formatarDocumento, statusConexao, TIPO_CONTA_LABEL } from "@/lib/extrato";
import { GRUPOS } from "@/lib/grupos";
import { deslocarMes, mesAtual, mesValido, rotuloMes } from "@/lib/periodo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { cn } from "@/lib/utils";
import { SincronizarButton } from "./sincronizar-button";
import { ConectarBancoForm } from "./conectar-form";
import { ConectarBancoButton } from "./conectar-banco";
import { CategoriaSelect, type GrupoOpcoes } from "./categoria-select";

export const dynamic = "force-dynamic";
// As actions desta página rodam o sync, que chama a Pluggy conta por conta.
export const maxDuration = 60;

// `data` é só a data (YYYY-MM-DD), lida como UTC para não voltar um dia.
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Alternativa ao widget: banco já autorizado pelo Meu Pluggy. */
function ViaMeuPluggy() {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-muted-foreground">
        Já conectou pelo Meu Pluggy? Cole o ID do item
      </summary>
      <div className="mt-3">
        <ConectarBancoForm />
      </div>
    </details>
  );
}

interface Filtro {
  mes: string;
  conta?: string;
  categoria?: string;
  sem?: boolean;
}

function hrefExtrato({ mes, conta, categoria, sem }: Filtro) {
  const params = new URLSearchParams({ mes });
  if (conta) params.set("conta", conta);
  if (categoria) params.set("categoria", categoria);
  if (sem) params.set("sem", "1");
  return `/extrato?${params}`;
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        ativo
          ? "border-primary bg-primary-soft text-on-primary-soft"
          : "border-border text-muted-foreground hover:bg-secondary"
      )}
    >
      {children}
    </Link>
  );
}

export default async function ExtratoPage({ searchParams }: PageProps<"/extrato">) {
  const params = await searchParams;
  const hoje = mesAtual();
  const mes = typeof params.mes === "string" && mesValido(params.mes) ? params.mes : hoje;
  const contaId = typeof params.conta === "string" && UUID.test(params.conta) ? params.conta : undefined;
  const categoriaId = typeof params.categoria === "string" && UUID.test(params.categoria) ? params.categoria : undefined;
  const semCategoria = params.sem === "1";
  const filtro: Filtro = { mes, conta: contaId, categoria: categoriaId, sem: semCategoria };

  const conexoes = await listarConexoesComContas();

  if (conexoes.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Extrato" description="Movimentações da conta da Safran, via Pluggy (Open Finance)" />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Conectar a conta da Safran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Escolha o banco e autorize pelo Open Finance, com o login de quem acessa a conta da empresa. O extrato é
              puxado na hora, e depois todo dia pelo sync automático. A DRE e o fluxo de caixa saem dele.
            </p>
            <ConectarBancoButton />
            <ViaMeuPluggy />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [linhas, categorias] = await Promise.all([
    listarMovimentacoesDoMes(mes, { contaId, categoriaId, semCategoria }),
    listarCategorias(),
  ]);
  const contas = conexoes.flatMap((c) => c.contas);
  const categoriaFiltrada = categoriaId ? categorias.find((c) => c.id === categoriaId) : undefined;

  const opcoes: GrupoOpcoes[] = GRUPOS.map((g) => ({
    label: g.label,
    itens: categorias.filter((c) => c.ativa && c.grupo === g.id).map((c) => ({ id: c.id, nome: c.nome })),
  })).filter((g) => g.itens.length > 0);

  const saldoEmConta = contas.filter((c) => c.tipo === "BANK").reduce((acc, c) => acc + c.saldoCentavos, 0);
  // Entradas e saídas do caixa: só contas (não cartão) e sem transferência
  // entre contas da própria Safran, que entraria duas vezes.
  const doCaixa = linhas.filter((l) => l.contaTipo === "BANK" && l.categoriaGrupo !== "transferencia");
  const entradas = doCaixa.filter((l) => l.valorCentavos > 0).reduce((acc, l) => acc + l.valorCentavos, 0);
  const saidas = doCaixa.filter((l) => l.valorCentavos < 0).reduce((acc, l) => acc + l.valorCentavos, 0);
  const pendentes = linhas.filter((l) => !l.categoriaId).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Extrato"
        description="Movimentações da conta da Safran, via Pluggy (Open Finance)"
        action={<SincronizarButton />}
      />

      <Card className="mb-5 gap-0 py-0">
        {conexoes.map((conexao) => {
          const st = statusConexao(conexao.status);
          return (
            <div key={conexao.id} className="space-y-3 border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Landmark className="size-4 text-muted-foreground" />
                  <p className="font-medium text-foreground">{conexao.instituicao ?? "Banco"}</p>
                  <Badge variant={st.tom}>{st.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {conexao.dadosAtualizadosEm
                    ? `Banco consultado em ${DATA_HORA.format(conexao.dadosAtualizadosEm)}`
                    : "Banco ainda não consultado"}
                  {conexao.ultimoSyncEm ? ` · sync em ${DATA_HORA.format(conexao.ultimoSyncEm)}` : null}
                </p>
              </div>

              {st.acao ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-on-warning-soft">{st.acao}</p>
                  {st.reconectar ? <ConectarBancoButton itemId={conexao.providerItemId} variant="secondary" /> : null}
                </div>
              ) : null}
              {conexao.ultimoSyncOk === false ? (
                <p className="text-sm text-destructive">Último sync falhou: {conexao.ultimoSyncDetalhe}</p>
              ) : null}

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {conexao.contas.map((conta) => (
                  <li key={conta.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">{conta.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_CONTA_LABEL[conta.subtipo ?? ""] ?? conta.subtipo ?? conta.tipo}
                      {conta.numero ? ` · ${conta.numero}` : null}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-foreground">
                      {conta.tipo === "CREDIT" ? "Fatura aberta " : "Saldo "}
                      {formatarCentavos(conta.saldoCentavos)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
          <ConectarBancoButton variant="secondary" />
          <ViaMeuPluggy />
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Wallet} label="Saldo em conta" value={formatarCentavos(saldoEmConta)} hint="hoje" />
        <StatTile icon={ArrowDownLeft} label="Entradas no mês" value={formatarCentavos(entradas)} tone="success" />
        <StatTile icon={ArrowUpRight} label="Saídas no mês" value={formatarCentavos(-saidas)} />
        <StatTile
          icon={Tags}
          label="Sem categoria"
          value={String(pendentes)}
          hint={pendentes > 0 ? "não entram certo na DRE" : "tudo categorizado"}
          tone={pendentes > 0 ? "warning" : "success"}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={hrefExtrato({ ...filtro, mes: deslocarMes(mes, -1) })}
            aria-label="Mês anterior"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <p className="min-w-40 text-center text-sm font-medium text-foreground">{rotuloMes(mes)}</p>
          {mes < hoje ? (
            <Link
              href={hrefExtrato({ ...filtro, mes: deslocarMes(mes, 1) })}
              aria-label="Próximo mês"
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

        <div className="flex flex-wrap gap-1.5">
          <Chip href={hrefExtrato({ ...filtro, sem: !semCategoria, categoria: undefined })} ativo={semCategoria}>
            Só sem categoria
          </Chip>
          {categoriaFiltrada ? (
            <Chip href={hrefExtrato({ ...filtro, categoria: undefined })} ativo>
              {categoriaFiltrada.nome}
              <X className="size-3" />
            </Chip>
          ) : null}
          {contas.length > 1
            ? [{ id: undefined, nome: "Todas as contas" }, ...contas].map((c) => (
                <Chip key={c.id ?? "todas"} href={hrefExtrato({ ...filtro, conta: c.id })} ativo={c.id === contaId}>
                  {c.nome}
                </Chip>
              ))
            : null}
        </div>
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={semCategoria ? "Nada sem categoria neste mês" : "Nenhuma movimentação neste mês"}
          description={
            semCategoria
              ? "Todas as movimentações do mês já têm categoria."
              : "Se o banco foi conectado agora, o histórico disponível no Open Finance já foi puxado — confira os meses anteriores."
          }
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {DATA.format(new Date(`${l.data}T00:00:00Z`))}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <p className="text-foreground">{l.nomeExibicao ?? l.descricao}</p>
                    {/* Renomeada por regra: a descrição do banco fica embaixo, para conferência. */}
                    {l.nomeExibicao ? <p className="text-xs text-muted-foreground">{l.descricao}</p> : null}
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
                      // A chave muda junto com a categoria: quando uma regra
                      // recategoriza a linha no servidor, o seletor remonta
                      // com o valor novo em vez de manter o antigo.
                      key={`${l.id}-${l.categoriaId ?? "sem"}`}
                      movimentacaoId={l.id}
                      categoriaId={l.categoriaId}
                      categoriaNome={l.categoriaNome}
                      automatica={l.categorizadaPor === "regra"}
                      regraId={l.regraId}
                      opcoes={opcoes}
                    />
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
