import { redirect } from "next/navigation";
import { listarUsuarios } from "@/db/queries/relatorios";
import { obterSessao } from "@/lib/auth";
import { podeGerirAcessos } from "@/lib/permissoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NovoUsuarioForm } from "./novo-usuario-form";
import { UsuariosLista } from "./usuarios-lista";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sessao = await obterSessao();
  if (!podeGerirAcessos(sessao)) redirect("/configuracoes");
  const usuarios = await listarUsuarios();

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Novo acesso</CardTitle>
          <CardDescription>
            A senha provisória aparece uma vez só; a pessoa troca em &quot;Trocar senha&quot; depois de entrar. Somente leitura serve para o contador: vê tudo, não muda nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovoUsuarioForm />
        </CardContent>
      </Card>
      <UsuariosLista usuarios={usuarios.map((u) => ({ ...u, criadoEm: u.createdAt.toISOString() }))} meuId={sessao!.userId} />
    </>
  );
}
