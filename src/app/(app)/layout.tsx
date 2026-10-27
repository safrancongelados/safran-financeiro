import { redirect } from "next/navigation";
import { alertasDisparados } from "@/db/queries/alertas";
import { contarSemCategoria } from "@/db/queries/financeiro";
import { obterSessao } from "@/lib/auth";
import { hojeISO } from "@/lib/periodo";
import { PAPEL_LABEL } from "@/lib/permissoes";
import { AppSidebar, type Contadores } from "@/components/app-sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sessao = await obterSessao();
  // O proxy já barra o acesso sem sessão; isto cobre cookie expirado no meio do caminho.
  if (!sessao) redirect("/login");

  // Os contadores do menu: o que falta categorizar e os alertas de agora. Se
  // o banco falhar aqui, o menu aparece sem números em vez de derrubar a tela.
  let contadores: Contadores = { revisar: 0, alertas: 0 };
  try {
    const [revisar, alertas] = await Promise.all([contarSemCategoria(), alertasDisparados(hojeISO())]);
    contadores = { revisar, alertas: alertas.length };
  } catch (err) {
    console.error("[layout] contadores do menu:", err instanceof Error ? err.message : err);
  }

  return (
    <>
      <AppSidebar nome={sessao.nome} papel={PAPEL_LABEL[sessao.papel]} contadores={contadores} />
      <main className="min-h-screen md:pl-60">{children}</main>
    </>
  );
}
