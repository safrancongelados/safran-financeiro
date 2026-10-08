import Link from "next/link";
import { contarSemCategoria, listarCategorias, listarRegras } from "@/db/queries/financeiro";
import { GRUPOS } from "@/lib/grupos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AplicarRegrasButton } from "./aplicar-regras-button";
import { RegraForm } from "./regra-form";
import { RegrasTabela } from "./regras-tabela";

export const dynamic = "force-dynamic";
// "Aplicar regras agora" percorre o extrato inteiro.
export const maxDuration = 60;

export default async function RegrasPage() {
  const [categorias, regras, semCategoria] = await Promise.all([listarCategorias(), listarRegras(), contarSemCategoria()]);
  const opcoes = GRUPOS.map((g) => ({
    label: g.label,
    itens: categorias.filter((c) => c.ativa && c.grupo === g.id).map((c) => ({ id: c.id, nome: c.nome })),
  })).filter((g) => g.itens.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Regras"
        description="Categorizam o extrato sozinhas e dão nome ao que aparece nele. Valem para o passado e para o que chegar no sync; categoria escolhida à mão nunca é trocada por regra."
        action={<AplicarRegrasButton />}
      />

      {semCategoria > 0 ? (
        <p className="mb-4 text-sm text-on-warning-soft">
          {semCategoria} movimentação(ões) ainda sem categoria.{" "}
          <Link href="/extrato?sem=1" className="font-medium underline">
            Ver no extrato
          </Link>
        </p>
      ) : null}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
          <CardDescription>
            Para o que muda de contraparte a cada vez — ex.: todo Pix recebido de cliente é venda. Regra por CPF/CNPJ vence
            regra por contraparte, que vence regra por descrição; entre duas de descrição, vence o texto mais longo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegraForm grupos={opcoes} />
        </CardContent>
      </Card>

      <RegrasTabela
        regras={regras.map((r) => ({
          id: r.id,
          campo: r.campo,
          padrao: r.padrao,
          sentido: r.sentido,
          nomeExibicao: r.nomeExibicao,
          categoriaId: r.categoriaId,
          categoriaNome: r.categoriaNome,
          lancamentos: r.lancamentos,
        }))}
        opcoes={opcoes}
      />
    </div>
  );
}
