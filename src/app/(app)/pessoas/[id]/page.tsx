import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Receipt, Target, Trash2, Wallet } from "lucide-react";
import { excluirPessoaAction } from "@/actions/pessoas";
import { listarCategorias, listarLinhasDre } from "@/db/queries/financeiro";
import { buscarPessoa, porCategoriaDaPessoa, resumoMensalDaPessoa, ultimosLancamentosDaPessoa } from "@/db/queries/pessoas";
import { obterSessao } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dinheiro";
import { formatarDocumento } from "@/lib/extrato";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { opcoesDeCategoria } from "@/lib/opcoes";
import { TIPO_PESSOA_LABEL } from "@/lib/pessoas";
import { deslocarMes, mesAtual, rotuloDia, rotuloMesAno, ultimosMeses } from "@/lib/periodo";
import { podeEditar } from "@/lib/permissoes";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PessoaForm } from "../pessoa-form";

export const dynamic = "force-dynamic";

export default async function PessoaPage({ params }: PageProps<"/pessoas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const pessoa = await buscarPessoa(id);
  if (!pessoa) notFound();

  const sessao = await obterSessao();
  const edita = podeEditar(sessao);
  const mes = mesAtual();
  const meses = ultimosMeses(12, mes);
  const inicio = `${meses[0]}-01`;
  const fim = `${deslocarMes(mes, 1)}-01`;

  const [porMes, porCategoria, recentes, categorias, linhas] = await Promise.all([
    resumoMensalDaPessoa(pessoa.id, inicio, fim),
    porCategoriaDaPessoa(pessoa.id, inicio, fim),
    ultimosLancamentosDaPessoa(pessoa.id, 10),
    listarCategorias(),
    listarLinhasDre(),
  ]);
  const porMesMap = new Map(porMes.map((m) => [m.mes, m]));
  const totalSaidas = porMes.reduce((acc, m) => acc + m.saidasCentavos, 0);
  const totalEntradas = porMes.reduce((acc, m) => acc + m.entradasCentavos, 0);
  const mesesComMovimento = porMes.filter((m) => m.saidasCentavos !== 0 || m.entradasCentavos !== 0).length;
  // Para funcionário, sócio e fornecedor o que importa é o que saiu para a pessoa; para cliente, o que entrou.
  const recebe = pessoa.tipo === "cliente";
  const principal = recebe ? totalEntradas : -totalSaidas;
  const mediaMensal = mesesComMovimento > 0 ? Math.round(principal / mesesComMovimento) : 0;
  const doMes = porMesMap.get(mes);
  const noMes = doMes ? (recebe ? doMes.entradasCentavos : -doMes.saidasCentavos) : 0;
  const meta = pessoa.metaMensalCentavos;
  const ultimo = recentes[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={pessoa.nome}
        description={`${TIPO_PESSOA_LABEL[pessoa.tipo]}${pessoa.documento ? ` · ${formatarDocumento(pessoa.documento)}` : ""}${pessoa.notas ? ` · ${pessoa.notas}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={hrefExtrato({ mes, periodo: "12m", pessoa: pessoa.id })}>
                <Receipt className="size-4" /> Ver no extrato
              </Link>
            </Button>
            {edita ? (
              <form action={excluirPessoaAction}>
                <input type="hidden" name="id" value={pessoa.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title="Apagar o cadastro (os lançamentos ficam, sem o vínculo)">
                  <Trash2 className="size-4" /> Apagar
                </Button>
              </form>
            ) : null}
          </div>
        }
      />

      {!pessoa.ativa ? <Badge variant="secondary" className="mb-4">inativa: não reconhece lançamentos novos</Badge> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Wallet} label={recebe ? "Recebido em 12 meses" : "Pago em 12 meses"} value={formatarCentavos(principal)} hint={`${mesesComMovimento} mês(es) com movimento`} />
        <StatTile icon={CalendarDays} label="Média por mês" value={formatarCentavos(mediaMensal)} hint="só meses com movimento" />
        <StatTile
          icon={Target}
          label={`Neste mês · ${rotuloMesAno(mes)}`}
          value={formatarCentavos(noMes)}
          hint={meta != null ? `meta ${formatarCentavos(meta)}` : "sem meta cadastrada"}
          tone={meta != null && noMes > meta ? "warning" : "default"}
        />
        <StatTile icon={Receipt} label="Último lançamento" value={ultimo ? rotuloDia(ultimo.data) : "—"} hint={ultimo ? formatarCentavos(ultimo.valorCentavos) : undefined} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden py-0 lg:col-span-2">
          <div className="px-5 pt-4 pb-2">
            <CardTitle>Mês a mês</CardTitle>
            <CardDescription className="mt-1">Entradas e saídas em conta, nos últimos 12 meses{meta != null ? `, contra a meta de ${formatarCentavos(meta)}` : ""}.</CardDescription>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                {meta != null ? <TableHead className="text-right">vs meta</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...meses].reverse().map((m) => {
                const d = porMesMap.get(m);
                const pago = d ? -d.saidasCentavos : 0;
                const desvio = meta != null ? pago - meta : null;
                return (
                  <TableRow key={m} className={cn(m === mes && "bg-primary/5")}>
                    <TableCell>
                      <Link href={hrefExtrato({ mes: m, pessoa: pessoa.id })} className="underline-offset-2 hover:underline">
                        {rotuloMesAno(m)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{d?.lancamentos ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{d && d.saidasCentavos !== 0 ? formatarCentavos(pago) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-on-success-soft">{d && d.entradasCentavos !== 0 ? formatarCentavos(d.entradasCentavos) : "—"}</TableCell>
                    {meta != null ? (
                      <TableCell className={cn("text-right tabular-nums", desvio !== null && desvio > 0 ? "text-on-warning-soft" : "text-muted-foreground")}>
                        {d && desvio !== null ? `${desvio > 0 ? "+" : ""}${formatarCentavos(desvio)}` : "—"}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-5">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Por categoria</CardTitle>
              <CardDescription>Onde os lançamentos dela caem. Tudo numa categoria só é bom sinal.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {porCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lançamento reconhecido ainda.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {porCategoria.map((c) => (
                    <li key={c.categoriaId ?? "sem"} className="flex items-center justify-between gap-2">
                      <Link
                        href={hrefExtrato({ mes, periodo: "12m", pessoa: pessoa.id, categoria: c.categoriaId ?? "sem" })}
                        className={cn("truncate underline-offset-2 hover:underline", !c.categoriaId && "text-on-warning-soft")}
                      >
                        {c.categoriaNome ?? "Sem categoria"} <span className="text-xs text-muted-foreground">· {c.lancamentos}</span>
                      </Link>
                      <span className="shrink-0 tabular-nums">{formatarCentavos(c.totalCentavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <div className="px-5 pt-4 pb-2">
              <CardTitle>Últimos lançamentos</CardTitle>
            </div>
            <ul className="divide-y divide-border">
              {recentes.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{rotuloDia(m.data)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{m.nomeExibicao ?? m.descricao}</span>
                  <span className={cn("shrink-0 tabular-nums", m.valorCentavos > 0 ? "text-on-success-soft" : "text-foreground")}>
                    {formatarCentavos(m.valorCentavos)}
                  </span>
                </li>
              ))}
              {recentes.length === 0 ? <li className="px-5 py-3 text-sm text-muted-foreground">Nada ainda.</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      {edita ? (
        <Card>
          <CardHeader>
            <CardTitle>Cadastro</CardTitle>
            <CardDescription>Mudar documento, trechos do nome ou categoria padrão reconhece o extrato inteiro de novo.</CardDescription>
          </CardHeader>
          <CardContent>
            <PessoaForm pessoa={pessoa} categorias={opcoesDeCategoria(linhas, categorias)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
