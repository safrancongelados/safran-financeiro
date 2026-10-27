import { redirect } from "next/navigation";

export default function RelatoriosPage() {
  redirect("/relatorios/pessoal?periodo=6m");
}
