import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { listarCategorias, listarLinhasDre, somasPorMesECategoria } from "@/db/queries/financeiro";
import {
  categoriasRateadas,
  estadoIntegracao,
  listarMapeamentos,
  pedidosRecentes,
  resumoPedidosPorMes,
  vendasPorCategoriaCw,
} from "@/db/queries/pedidos";
import { estaConfigurado } from "@/lib/cardapio-web/client";
import { formatarCentavos, formatarPercentual } from "@/lib/dinheiro";
import { opcoesDeCategoria } from "@/lib/opcoes";
import { deslocarMes, mesAtual, mesValido, rotuloDia, rotuloMes, rotuloMesAno, ultimosMeses } from "@/lib/periodo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, GrupoChips } from "@/components/chip";
import { SincronizarPedidosButton } from "@/components/cardapio-web/sincronizar-pedidos-button";
import { MapeamentoSelect } from "@/components/cardapio-web/mapeamento-select";

export const dynamic = "force-dynamic";
// Sincronizar detalha até 150 pedidos, seis por vez.
export const maxDuration = 300;

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

const MEIO: Record<string, string> = {
  pix_auto: "Pix automático",
  pix: "Pix",
  online_credit_card: "Cartão online",
  credit_card: "Cartão",
  meal_voucher: "Vale refeição",
  food_voucher: "Vale alimentação",
  money: "Dinheiro",
};

export default async function CardapioWebPage({ searchParams }: PageProps<"/configuracoes/cardapio-web">) {
  const params = await searchParams;
  const hoje = mesAtual();
  // `?mes=` vem da DRE: foca um mês; sem ele, os últimos 12.
  const mesFoco = typeof params.mes === "string" && mesValido(params.mes) && params.mes <= hoje ? params.mes : null;
  const meses = mesFoco ? [mesFoco] : ultimosMeses(12, hoje);
  const inicio = `${meses[0]}-01`;
  const fim = `${deslocarMes(meses[meses.length - 1], 1)}-01`;
  const configurado = estaConfigurado();

  const [estado, mapeamentos, linhas, categorias, rateadas, resumo, porCategoria, recentes, somas] = await Promise.all([
    estadoIntegracao(),
    listarMapeamentos(),
    listarLinhasDre(),
    listarCategorias(),
    categoriasRateadas(),
    resumoPedidosPorMes(inicio, fim),
    vendasPorCategoriaCw(inicio, fim),
    pedidosRecentes(10),
    somasPorMesECategoria(inicio, fim),
  ]);
  const opcoes = opcoesDeCategoria(
    linhas,
    categorias.filter((c) => linhas.find((l) => l.id === c.linhaId)?.secao === "dre")
  );
  const padrao = categorias.find((c) => c.id === rateadas.padraoId) ?? null;
  const rateadasNomes = categorias.filter((c) => rateadas.ids.has(c.id)).map((c) => c.nome);

  // O recebido no banco nas categorias rateadas, por mês — para comparar com o vendido.
  const recebidoPorMes = new Map<string, number>();
  for (const s of somas) {
    if (s.categoriaId && rateadas.ids.has(s.categoriaId)) recebidoPorMes.set(s.mes, (recebidoPorMes.get(s.mes) ?? 0) + s.valorCentavos);
  }
  const resumoPorMes = new Map(resumo.map((r) => [r.mes, r]));
  const totalVendido = porCategoria.reduce((acc, c) => acc + c.centavos, 0);
  const temPedidos = resumo.length > 0 || recentes.length > 0;

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Como os pedidos entram</CardTitle>
          <CardDescription>
            Os pedidos fechados da loja virtual são lidos da API do Cardápio Web todo dia às 07:30 (Maceió) e quando
            alguém clica em <em>Sincronizar pedidos</em>. Eles não mexem no caixa — o caixa é o extrato. Servem para
            repartir, mês a mês, o recebido em{" "}
            {rateadasNomes.length > 0 ? <strong>{rateadasNomes.join(", ")}</strong> : <em>nenhuma categoria rateada</em>}{" "}
            entre as linhas de produto da DRE, na proporção do que os pedidos venderam em cada uma. Qual categoria é
            rateada se marca na{" "}
            <Link href="/configuracoes" className="font-medium underline">
              estrutura da DRE
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!configurado ? (
            <p className="text-sm text-on-warning-soft">
              Integração não configurada: defina <span className="font-mono">CARDAPIO_WEB_API_URL</span>,{" "}
              <span className="font-mono">CARDAPIO_WEB_TOKEN</span> e <span className="font-mono">CARDAPIO_WEB_MERCHANT_UUID</span>{" "}
              na Vercel (ver <span className="font-mono">.env.local.example</span>). Sem isso, toda venda fica na categoria rateada.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <SincronizarPedidosButton variant={temPedidos ? "secondary" : "primary"} />
            {estado ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <ShoppingBag className="size-4" />
                <span className="font-medium text-foreground">{estado.lojaNome ?? "Loja"}</span>
                {estado.ultimoSyncOk === true ? <Badge variant="success">Sincronizado</Badge> : null}
                {estado.ultimoSyncOk === false ? <Badge variant="destructive">Falhou</Badge> : null}
                {estado.ultimoSyncEm ? <span>sync em {DATA_HORA.format(estado.ultimoSyncEm)}</span> : null}
                {estado.cobertoDesde ? <span>· histórico desde {rotuloDia(estado.cobertoDesde)}/{estado.cobertoDesde.slice(0, 4)}</span> : null}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Nenhum pedido sincronizado ainda.</span>
            )}
          </div>
          {estado?.ultimoSyncDetalhe ? (
            <p className={estado.ultimoSyncOk === false ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {estado.ultimoSyncOk === false ? "Último sync falhou: " : null}
              {estado.ultimoSyncDetalhe}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <GrupoChips rotulo="Período">
          <Chip href="/configuracoes/cardapio-web" ativo={!mesFoco}>
            Últimos 12 meses
          </Chip>
          {mesFoco ? (
            <Chip href={`/configuracoes/cardapio-web?mes=${mesFoco}`} ativo>
              {rotuloMes(mesFoco)}
            </Chip>
          ) : null}
        </GrupoChips>
      </div>

      <Card className="mb-5 gap-0 py-0">
        <div className="px-5 pt-4 pb-3">
          <CardTitle>Linhas de produto</CardTitle>
          <CardDescription className="mt-1">
            Cada categoria do cardápio vende em uma categoria da DRE. Sem destino, vai para a rateada padrão
            {padrao ? ` (${padrao.nome})` : ""}. A coluna da direita é o que os pedidos venderam no período — a proporção
            do rateio.
          </CardDescription>
        </div>
        {mapeamentos.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Sincronize os pedidos para as categorias do cardápio aparecerem aqui.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria no cardápio</TableHead>
                <TableHead>Vende em (DRE)</TableHead>
                <TableHead className="text-right">Vendido no período</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapeamentos.map((m) => {
                const venda = porCategoria.find((c) => c.categoriaCw === m.categoriaCw);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-foreground">{m.categoriaCw}</TableCell>
                    <TableCell>
                      <MapeamentoSelect id={m.id} categoriaId={m.categoriaId} opcoes={opcoes} padraoNome={padrao?.nome ?? null} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{venda ? formatarCentavos(venda.centavos) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {venda ? formatarPercentual(venda.centavos, totalVendido) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {porCategoria.some((c) => c.categoriaCw === null) ? (
                <TableRow>
                  <TableCell className="text-muted-foreground">Itens fora do catálogo atual</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{padrao ? `Padrão (${padrao.nome})` : "Sem destino"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarCentavos(porCategoria.find((c) => c.categoriaCw === null)!.centavos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatarPercentual(porCategoria.find((c) => c.categoriaCw === null)!.centavos, totalVendido)}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="mb-5 gap-0 py-0">
        <div className="px-5 pt-4 pb-3">
          <CardTitle>Vendido × recebido, mês a mês</CardTitle>
          <CardDescription className="mt-1">
            Pedidos não cancelados pela data do pedido, contra o que caiu na conta nas categorias rateadas. A diferença é
            o prazo da Tuna e das maquininhas, as taxas descontadas na fonte e vendas fora da loja virtual (dieta, personal
            chef por Pix direto).
          </CardDescription>
        </div>
        {resumo.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Sem pedidos no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Itens vendidos</TableHead>
                <TableHead className="text-right">Com entrega</TableHead>
                <TableHead className="text-right">Recebido no banco</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses
                .filter((m) => resumoPorMes.has(m) || recebidoPorMes.has(m))
                .map((m) => {
                  const r = resumoPorMes.get(m);
                  const recebido = recebidoPorMes.get(m) ?? 0;
                  const dif = recebido - (r?.totalCentavos ?? 0);
                  return (
                    <TableRow key={m}>
                      <TableCell className="font-medium text-foreground">
                        {rotuloMesAno(m)}
                        {m === hoje ? <span className="ml-1 text-primary">•</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r ? r.pedidos : 0}
                        {r && r.cancelados > 0 ? <span className="text-xs text-muted-foreground"> (+{r.cancelados} canc.)</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarCentavos(r?.itensCentavos ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarCentavos(r?.totalCentavos ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link href={`/extrato?mes=${m}${rateadas.padraoId ? `&categoria=${rateadas.padraoId}` : ""}`} className="hover:underline">
                          {formatarCentavos(recebido)}
                        </Link>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${dif < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {dif === 0 ? "—" : `${dif > 0 ? "+" : "−"}${formatarCentavos(Math.abs(dif))}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <div className="px-5 pt-4 pb-3">
          <CardTitle>Últimos pedidos sincronizados</CardTitle>
          <CardDescription className="mt-1">Para conferir que o sync está vivo. O detalhe de cada pedido fica no painel do Cardápio Web.</CardDescription>
        </div>
        {recentes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{rotuloDia(p.data)}</span>
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">#{p.displayId ?? p.pedidoId}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{p.clienteNome ?? "Cliente"}</span>
                <span className="hidden shrink-0 sm:block">
                  <Badge variant={p.status === "canceled" ? "destructive" : "secondary"}>
                    {p.status === "canceled" ? "cancelado" : (MEIO[p.meioPagamento ?? ""] ?? p.meioPagamento ?? "fechado")}
                  </Badge>
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-foreground">{formatarCentavos(p.totalCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
