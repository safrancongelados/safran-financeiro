import { Trash2 } from "lucide-react";
import { excluirLinhaAction, moverCategoriaAction, moverLinhaAction } from "@/actions/configuracoes";
import { listarCategorias, listarCentrosCusto, listarLinhasDre } from "@/db/queries/financeiro";
import { opcoesDeCentro, SECAO_LABEL } from "@/lib/opcoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoriaForm } from "./categoria-form";
import { LinhaForm } from "./linha-form";
import { Mover } from "./mover";

export const dynamic = "force-dynamic";
// Mudar o centro padrão de uma categoria reaplica as regras no extrato inteiro.
export const maxDuration = 60;

export default async function EstruturaDrePage() {
  const [linhas, categorias, centros] = await Promise.all([listarLinhasDre(), listarCategorias(), listarCentrosCusto()]);
  const opcoesCentro = opcoesDeCentro(centros);
  const grupos = linhas.filter((l) => l.tipo === "grupo").map((l) => ({ id: l.id, nome: l.nome }));

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Como a DRE é montada</CardTitle>
          <CardDescription>
            De cima para baixo, na ordem abaixo. Uma linha de <strong>grupo</strong> soma as categorias dela; um{" "}
            <strong>subtotal</strong> é a soma de todos os grupos da DRE acima dele (assim saem receita líquida, margem
            e resultado). Grupos <em>fora da DRE</em> só aparecem no fluxo de caixa. Cada lançamento do extrato cai na
            linha da sua categoria, e no centro de custo padrão dela — a não ser que uma regra diga outro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm font-medium text-foreground">Nova linha</p>
          <LinhaForm />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {linhas.map((linha, i) => {
          const daLinha = categorias.filter((c) => c.linhaId === linha.id);
          const subtotal = linha.tipo === "subtotal";
          return (
            <Card key={linha.id} className={cn("gap-3 py-3", subtotal && "bg-secondary/40")}>
              <div className="flex items-start gap-2 px-4">
                <Mover id={linha.id} action={moverLinhaAction} primeiro={i === 0} ultimo={i === linhas.length - 1} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={subtotal ? "sky" : "secondary"}>{subtotal ? "= subtotal" : "grupo"}</Badge>
                    {linha.secao !== "dre" ? <Badge variant="warning">{SECAO_LABEL[linha.secao]}</Badge> : null}
                    {linha.basePercentual ? <Badge variant="success">base do %</Badge> : null}
                  </div>
                  <LinhaForm
                    key={`${linha.id}-${linha.nome}-${linha.secao}-${linha.basePercentual}-${linha.mostrarPercentual}`}
                    linha={linha}
                  />
                </div>
                {subtotal || daLinha.length === 0 ? (
                  <form action={excluirLinhaAction}>
                    <input type="hidden" name="id" value={linha.id} />
                    <Button type="submit" variant="ghost" size="icon" title="Apagar linha" className="text-muted-foreground">
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                ) : null}
              </div>

              {subtotal ? null : (
                <div className="mx-4 space-y-1.5 border-l-2 border-border pl-4">
                  {daLinha.map((c, j) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Mover id={c.id} action={moverCategoriaAction} primeiro={j === 0} ultimo={j === daLinha.length - 1} />
                      <CategoriaForm
                        key={`${c.id}-${c.nome}-${c.linhaId}-${c.centroCustoId ?? ""}-${c.ativa}`}
                        categoria={c}
                        linhaId={linha.id}
                        linhas={grupos}
                        centros={opcoesCentro}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="w-5 shrink-0" />
                    <CategoriaForm linhaId={linha.id} linhas={grupos} centros={opcoesCentro} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
