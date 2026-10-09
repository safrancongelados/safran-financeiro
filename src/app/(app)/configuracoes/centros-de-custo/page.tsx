import { Trash2 } from "lucide-react";
import { excluirCentroAction, moverCentroAction } from "@/actions/configuracoes";
import { listarCategorias, listarCentrosCusto } from "@/db/queries/financeiro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mover } from "../mover";
import { CentroForm } from "./centro-form";

export const dynamic = "force-dynamic";
// Apagar um centro reaplica as regras no extrato inteiro.
export const maxDuration = 60;

export default async function CentrosDeCustoPage() {
  const [centros, categorias] = await Promise.all([listarCentrosCusto(), listarCategorias()]);

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Novo centro de custo</CardTitle>
          <CardDescription>
            O centro de custo de um lançamento vem da categoria (o padrão, definido em Estrutura da DRE). Quando um
            lançamento foge do padrão, troque o centro no extrato: vale para as linhas iguais. A DRE pode ser filtrada
            por centro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CentroForm />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        {centros.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum centro de custo ainda.</p>
        ) : (
          centros.map((c, i) => {
            const padraoDe = categorias.filter((cat) => cat.centroCustoId === c.id).map((cat) => cat.nome);
            return (
              <div key={c.id} className="flex items-start gap-2 border-b border-border px-4 py-3 last:border-0">
                <Mover id={c.id} action={moverCentroAction} primeiro={i === 0} ultimo={i === centros.length - 1} />
                <div className="min-w-0 flex-1">
                  <CentroForm key={`${c.id}-${c.nome}-${c.ativo}`} centro={c} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {padraoDe.length > 0 ? `Padrão de: ${padraoDe.join(", ")}` : "Nenhuma categoria usa como padrão."}
                  </p>
                </div>
                <form action={excluirCentroAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" variant="ghost" size="icon" title="Apagar centro" className="text-muted-foreground">
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}
