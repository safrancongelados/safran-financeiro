import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { formatarCentavos } from "@/lib/dinheiro";
import { hrefExtrato } from "@/lib/extrato-filtros";
import { hojeISO, lerPeriodo, rotuloMesAno } from "@/lib/periodo";
import { TIPO_PESSOA_LABEL } from "@/lib/pessoas";
import { relatorioPessoal, type LinhaPessoal } from "@/lib/relatorios-dados";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BarraRelatorio, LinkPessoa } from "../relatorio-comum";

export const dynamic = "force-dynamic";

function Celula({ v }: { v: number }) {
  return <span className={cn("tabular-nums", v === 0 && "text-muted-foreground/50")}>{v === 0 ? "—" : formatarCentavos(-v)}</span>;
}

function TabelaPessoal({ linhas, meses, hoje, comMeta }: { linhas: LinhaPessoal[]; meses: string[]; hoje: string; comMeta: boolean }) {
  const mesCorrente = hoje.slice(0, 7);
  return (
    <Card className="overflow-hidden py-0">
      <div className="relative w-full overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-card">Pessoa</TableHead>
              {meses.map((m) => (
                <TableHead key={m} className={cn("text-right", m === mesCorrente && "bg-primary/5 text-foreground")}>
                  {rotuloMesAno(m)}
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Média</TableHead>
              {comMeta ? <TableHead className="text-right">Acima da meta</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                <TableCell className="sticky left-0 z-10 max-w-56 whitespace-normal bg-card">
                  <LinkPessoa id={l.pessoaId} nome={l.nome} />
                  <span className="block text-xs text-muted-foreground">
                    {l.pessoaId ? TIPO_PESSOA_LABEL[l.tipo as keyof typeof TIPO_PESSOA_LABEL] ?? l.tipo : "sem cadastro"} · {l.lancamentos} lançamento(s)
                    {l.metaMensalCentavos != null ? ` · meta ${formatarCentavos(l.metaMensalCentavos)}` : ""}
                  </span>
                </TableCell>
                {meses.map((m) => {
                  const v = l.porMes[m] ?? 0;
                  const acima = l.metaMensalCentavos != null && -v > l.metaMensalCentavos;
                  return (
                    <TableCell key={m} className={cn("text-right", m === mesCorrente && "bg-primary/5", acima && "text-on-warning-soft")}>
                      {v !== 0 && l.pessoaId ? (
                        <Link href={hrefExtrato({ mes: m, pessoa: l.pessoaId })} className="hover:underline">
                          <Celula v={v} />
                        </Link>
                      ) : (
                        <Celula v={v} />
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-medium tabular-nums">{formatarCentavos(-l.total)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatarCentavos(-l.media)}</TableCell>
                {comMeta ? (
                  <TableCell className={cn("text-right tabular-nums", l.acimaDaMeta > 0 ? "text-on-warning-soft" : "text-muted-foreground/50")}>
                    {l.acimaDaMeta > 0 ? formatarCentavos(l.acimaDaMeta) : "—"}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default async function RelatorioPessoalPage({ searchParams }: PageProps<"/relatorios/pessoal">) {
  const params = await searchParams;
  const hoje = hojeISO();
  const periodo = lerPeriodo(params, hoje);
  const r = await relatorioPessoal(periodo, hoje);
  const socios = r.cadastradas.filter((l) => l.tipo === "socio");
  const funcionarios = r.cadastradas.filter((l) => l.tipo !== "socio");
  const comMeta = r.cadastradas.some((l) => l.metaMensalCentavos != null);
  const totalSocios = socios.reduce((a, l) => a + l.total, 0);
  const totalFunc = funcionarios.reduce((a, l) => a + l.total, 0);
  const totalSem = r.semCadastro.reduce((a, l) => a + l.total, 0);

  return (
    <>
      <BarraRelatorio tipo="pessoal" periodo={periodo} hoje={hoje} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Sócios" value={formatarCentavos(-totalSocios)} hint={`${socios.length} pessoa(s)`} />
        <StatTile icon={Users} label="Funcionários" value={formatarCentavos(-totalFunc)} hint={`${funcionarios.length} pessoa(s)`} />
        <StatTile
          icon={UserPlus}
          label="Sem cadastro"
          value={formatarCentavos(-totalSem)}
          hint={r.semCadastro.length > 0 ? `${r.semCadastro.length} nome(s) em categoria de pessoal` : "tudo cadastrado"}
          tone={r.semCadastro.length > 0 ? "warning" : "success"}
        />
        <StatTile icon={Users} label="Total de pessoal" value={formatarCentavos(-r.total)} hint={`${r.meses.length} mês(es)`} />
      </div>

      {r.cadastradas.length === 0 && r.semCadastro.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum pagamento de pessoal no período"
          description="Cadastre funcionários e sócios em Pessoas; os lançamentos deles passam a aparecer aqui, mês a mês."
          actionHref="/pessoas"
          actionLabel="Ir para Pessoas"
        />
      ) : null}

      {socios.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Sócios</h2>
          <TabelaPessoal linhas={socios} meses={r.meses} hoje={hoje} comMeta={comMeta} />
        </section>
      ) : null}
      {funcionarios.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Funcionários</h2>
          <TabelaPessoal linhas={funcionarios} meses={r.meses} hoje={hoje} comMeta={comMeta} />
        </section>
      ) : null}
      {r.semCadastro.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Em categoria de pessoal, sem cadastro</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Caíram em pró-labore, salários ou reembolsos a sócios, mas ninguém sabe de quem são. Cadastre a pessoa em{" "}
            <Link href="/pessoas/nova" className="underline">
              Pessoas
            </Link>{" "}
            ou corrija a categoria no extrato.
          </p>
          <TabelaPessoal linhas={r.semCadastro} meses={r.meses} hoje={hoje} comMeta={false} />
        </section>
      ) : null}
    </>
  );
}
