import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sessao = await obterSessao();
  // O proxy já barra o acesso sem sessão; isto cobre cookie expirado no meio do caminho.
  if (!sessao) redirect("/login");

  return (
    <>
      <AppSidebar nome={sessao.nome} />
      <main className="min-h-screen md:pl-60">{children}</main>
    </>
  );
}
