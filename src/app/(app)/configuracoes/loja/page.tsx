import { listarCategorias, listarVendasPorProduto } from "@/db/queries/financeiro";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { LINHA_PRODUTO_LABEL, LINHAS_PRODUTO } from "@/lib/opcoes";
import { rotuloMesAno } from "@/lib/periodo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { LojaForm } from "./loja-form";

export const dynamic = "force-dynamic";

export default async function LojaPage() {
  const [vendas, categorias] = await Promise.all([listarVendasPorProduto(), listarCategorias()]);
  const base = categorias.find((c) => c.rateada);
  const destinos = LINHAS_PRODUTO.map((l) => ({ linha: l, categoria: categorias.find((c) => c.linhaProduto === l) }));

  // Uma linha por mês, com as quatro colunas.
  const meses = [...new Set(vendas.map((v) => v.mes))].sort().reverse();
  const porMes = new Map(meses.map((m) => [m, Object.fromEntries(vendas.filter((v) => v.mes === m).map((v) => [v.linha, v]))]));

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Como as vendas viram linhas de produto</CardTitle>
          <CardDescription>
            O extrato não sabe o que foi vendido: um Pix da Tuna ou uma liberação do Mercado Pago é só dinheiro. Por
            isso a DRE reparte a categoria{" "}
            <strong>{base ? base.nome : "(nenhuma categoria marcada como base)"}</strong> de cada mês pelo mix de
            pedidos da loja (Cardápio Web) daquele mês, entre{" "}
            {destinos.map((d, i) => (
              <span key={d.linha}>
                {i > 0 ? (i === destinos.length - 1 ? " e " : ", ") : ""}
                <strong>{d.categoria?.nome ?? `(sem destino para ${LINHA_PRODUTO_LABEL[d.linha].toLowerCase()})`}</strong>
              </span>
            ))}
            . Mês sem mix fica inteiro em marmitas, com aviso na DRE. Quem é base e quem recebe cada linha se marca na
            Estrutura da DRE.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm font-medium text-foreground">Gravar ou corrigir o mix</p>
          <LojaForm />
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              {LINHAS_PRODUTO.map((l) => (
                <TableHead key={l} className="text-right">
                  {LINHA_PRODUTO_LABEL[l]}
                </TableHead>
              ))}
              <TableHead className="text-right">Total da loja</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Nenhum mês gravado ainda. Sem mix, a DRE deixa todas as vendas em marmitas.
                </TableCell>
              </TableRow>
            ) : (
              meses.map((m) => {
                const v = porMes.get(m)!;
                const total = LINHAS_PRODUTO.reduce((acc, l) => acc + (v[l]?.valorCentavos ?? 0), 0);
                const pedidos = LINHAS_PRODUTO.reduce((acc, l) => acc + (v[l]?.pedidos ?? 0), 0);
                return (
                  <TableRow key={m}>
                    <TableCell className="font-medium">{rotuloMesAno(m)}</TableCell>
                    {LINHAS_PRODUTO.map((l) => (
                      <TableCell key={l} className="text-right tabular-nums">
                        {formatarCentavos(v[l]?.valorCentavos ?? 0)}
                        <span className="block text-xs text-muted-foreground">{formatarPercentual(v[l]?.valorCentavos ?? 0, total)}</span>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">{formatarCentavos(total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{pedidos}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
