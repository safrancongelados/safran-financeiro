import Link from "next/link";
import { listarCategorias } from "@/db/queries/financeiro";
import { GRUPOS } from "@/lib/grupos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { CategoriaForm } from "./categoria-form";

export const dynamic = "force-dynamic";
// Só leitura: se o banco travar, falha rápido e mostra "tentar de novo".
export const maxDuration = 30;

export default async function PlanoDeContasPage() {
  const categorias = await listarCategorias();

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

      <p className="mt-6 text-sm text-muted-foreground">
        O que categoriza o extrato sozinho (e o nome que cada lançamento mostra) fica em{" "}
        <Link href="/regras" className="font-medium text-foreground underline">
          Regras
        </Link>
        .
      </p>
    </div>
  );
}
