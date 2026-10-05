import { Trash2 } from "lucide-react";
import { excluirRegraAction } from "@/actions/categorias";
import { listarCategorias, listarRegras } from "@/db/queries/financeiro";
import { formatarDocumento } from "@/lib/extrato";
import { GRUPOS } from "@/lib/grupos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { CategoriaForm } from "./categoria-form";
import { RegraForm } from "./regra-form";

export const dynamic = "force-dynamic";

const CAMPO = { documento: "CPF/CNPJ é", contraparte: "Contraparte contém", descricao: "Descrição contém" } as const;
const SENTIDO = { entrada: "entradas", saida: "saídas", ambos: "entradas e saídas" } as const;

export default async function PlanoDeContasPage() {
  const [categorias, regras] = await Promise.all([listarCategorias(), listarRegras()]);
  const opcoes = GRUPOS.map((g) => ({
    label: g.label,
    itens: categorias.filter((c) => c.ativa && c.grupo === g.id).map((c) => ({ id: c.id, nome: c.nome })),
  })).filter((g) => g.itens.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Plano de contas"
        description="Cada categoria cai numa linha da DRE. Desativar esconde do extrato sem apagar o histórico."
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoriaForm />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {GRUPOS.map((g) => {
          const doGrupo = categorias.filter((c) => c.grupo === g.id);
          return (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {g.label}
                  {g.naDre ? null : <Badge variant="secondary">fora da DRE</Badge>}
                </CardTitle>
                <CardDescription>{g.ajuda}</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {doGrupo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma categoria neste grupo.</p>
                ) : (
                  doGrupo.map((c) => (
                    <CategoriaForm key={`${c.id}-${c.nome}-${c.grupo}-${c.ativa}`} categoria={c} />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-8 mb-1 text-lg font-semibold text-foreground">Regras automáticas</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Nascem no extrato, quando você escolhe aplicar uma categoria a todas as movimentações da mesma contraparte.
        Valem para o passado e para o que chegar no sync. Categoria escolhida à mão nunca é mudada por regra.
      </p>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
          <CardDescription>
            Para o que muda de contraparte a cada vez — ex.: todo Pix recebido de cliente é venda. Regra por CPF/CNPJ ou
            por contraparte vence regra por descrição, então um aporte de sócio continua separado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegraForm grupos={opcoes} />
        </CardContent>
      </Card>
      <Card className="overflow-hidden py-0">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Vale para</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {regras.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nenhuma regra ainda.
                </TableCell>
              </TableRow>
            ) : (
              regras.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="text-muted-foreground">{CAMPO[r.campo]} </span>
                    <span className="font-medium text-foreground">
                      {r.campo === "documento" ? formatarDocumento(r.padrao) : `“${r.padrao}”`}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{SENTIDO[r.sentido]}</TableCell>
                  <TableCell>{r.categoriaNome}</TableCell>
                  <TableCell>
                    <form action={excluirRegraAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="ghost" size="icon" title="Apagar regra" className="text-muted-foreground">
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
