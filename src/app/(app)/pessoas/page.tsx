import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { listarPessoas } from "@/db/queries/pessoas";
import { obterSessao } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dinheiro";
import { TIPO_PESSOA_LABEL, TIPOS_PESSOA } from "@/lib/pessoas";
import { deslocarMes, mesAtual, rotuloDia } from "@/lib/periodo";
import { podeEditar } from "@/lib/permissoes";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PessoasPage() {
  const sessao = await obterSessao();
  const inicio = `${deslocarMes(mesAtual(), -11)}-01`;
  const pessoas = await listarPessoas(inicio);
  const edita = podeEditar(sessao);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Pessoas"
        description="Funcionários, sócios, fornecedores e clientes. O sistema reconhece os lançamentos de cada um pelo CPF/CNPJ ou pelo nome que o banco escreve."
        action={
          edita ? (
            <Button asChild>
              <Link href="/pessoas/nova">
                <Plus className="size-4" /> Nova pessoa
              </Link>
            </Button>
          ) : undefined
        }
      />

      {pessoas.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma pessoa cadastrada"
          description="Cadastre quem recebe ou paga com frequência. No extrato, cada contraparte tem um atalho para virar pessoa."
          actionHref={edita ? "/pessoas/nova" : undefined}
          actionLabel={edita ? "Cadastrar a primeira" : undefined}
        />
      ) : (
        TIPOS_PESSOA.filter((t) => pessoas.some((p) => p.tipo === t)).map((tipo) => {
          const doTipo = pessoas.filter((p) => p.tipo === tipo);
          const total = doTipo.reduce((acc, p) => acc + p.totalCentavos, 0);
          return (
            <section key={tipo} className="mb-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {TIPO_PESSOA_LABEL[tipo]}
                  {doTipo.length > 1 ? "s" : ""} <span className="font-normal text-muted-foreground">· {doTipo.length}</span>
                </h2>
                <span className="text-xs text-muted-foreground">últimos 12 meses: {formatarCentavos(total)}</span>
              </div>
              <Card className="overflow-hidden py-0">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria padrão</TableHead>
                      <TableHead className="text-right">Lançamentos</TableHead>
                      <TableHead className="text-right">Total 12 meses</TableHead>
                      <TableHead className="text-right">Média mensal</TableHead>
                      <TableHead className="text-right">Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doTipo.map((p) => (
                      <TableRow key={p.id} className={cn(!p.ativa && "opacity-60")}>
                        <TableCell className="whitespace-normal">
                          <Link href={`/pessoas/${p.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                            {p.nome}
                          </Link>
                          {!p.ativa ? <Badge variant="secondary" className="ml-2">inativa</Badge> : null}
                          {p.metaMensalCentavos != null ? (
                            <span className="block text-xs text-muted-foreground">meta {formatarCentavos(p.metaMensalCentavos)}/mês</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.categoriaNome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.lancamentos}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", p.totalCentavos > 0 ? "text-on-success-soft" : "text-foreground")}>
                          {formatarCentavos(p.totalCentavos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatarCentavos(Math.round(p.totalCentavos / 12))}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{p.ultimaData ? rotuloDia(p.ultimaData) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}
