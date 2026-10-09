import Link from "next/link";
import {
  contarPorRegra,
  contarSemCategoria,
  listarCategorias,
  listarCentrosCusto,
  listarLinhasDre,
  listarRegras,
} from "@/db/queries/financeiro";
import { opcoesDeCategoria, opcoesDeCentro } from "@/lib/opcoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AplicarRegrasButton } from "./aplicar-regras-button";
import { RegraForm } from "./regra-form";
import { RegrasTabela } from "./regras-tabela";

export const dynamic = "force-dynamic";
// "Aplicar regras agora" percorre o extrato inteiro.
export const maxDuration = 60;

export default async function RegrasPage() {
  const [categorias, linhas, centros, regras, semCategoria] = await Promise.all([
    listarCategorias(),
    listarLinhasDre(),
    listarCentrosCusto(),
    listarRegras(),
    contarSemCategoria(),
  ]);
  const opcoes = opcoesDeCategoria(linhas, categorias);
  const opcoesCentro = opcoesDeCentro(centros);
  const casam = await contarPorRegra(regras);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Toda edição de nome, categoria ou centro feita no extrato vira (ou atualiza) uma regra aqui, e vale para as
          linhas iguais — passadas e futuras. Regra por CPF/CNPJ vence regra por contraparte, que vence regra por
          descrição; entre duas de descrição, vence o texto mais longo. Categoria escolhida com &quot;Só nesta&quot;
          nunca é trocada por regra.
        </p>
        <AplicarRegrasButton />
      </div>

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
            Para o que muda de contraparte a cada vez — ex.: todo Pix recebido de cliente é venda. Cada regra decide
            categoria, nome e/ou centro de custo; o que ela não decide fica com a próxima regra que casar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegraForm grupos={opcoes} centros={opcoesCentro} />
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
          centroCustoId: r.centroCustoId,
          lancamentos: casam.get(r.id) ?? 0,
        }))}
        opcoes={opcoes}
        centros={opcoesCentro}
      />
    </>
  );
}
