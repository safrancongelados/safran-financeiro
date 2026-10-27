import { NextResponse } from "next/server";
import { alertasDisparados } from "@/db/queries/alertas";
import { categoriasParaDre, contarSemCategoria, listarLinhasDre, mixPorMes, saldoAtualDasContas, somasPorMesECategoria } from "@/db/queries/financeiro";
import { previsoesDoMes } from "@/db/queries/recorrencias";
import { formatarCentavos } from "@/lib/dinheiro";
import { montarDre } from "@/lib/dre";
import { deslocarMes, hojeISO, rotuloDia, rotuloMes } from "@/lib/periodo";
import { numerosDoMes } from "@/lib/resumo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O resumo semanal, chamado pelo Vercel Cron toda segunda (ver vercel.json):
 * saldo, receita e resultado do mês, pendências, alertas e o que está
 * previsto para os próximos 30 dias.
 *
 * Com RESEND_API_KEY e RESUMO_EMAIL_PARA configurados, envia por e-mail
 * (Resend, https://resend.com). Sem eles, só devolve o resumo em JSON — dá
 * para ler no painel de crons e serve de teste.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const hoje = hojeISO();
  const mes = hoje.slice(0, 7);
  const [linhas, categorias, somas, mix, saldo, semCategoria, alertas, previsoes] = await Promise.all([
    listarLinhasDre(),
    categoriasParaDre(),
    somasPorMesECategoria(`${mes}-01`, `${deslocarMes(mes, 1)}-01`),
    mixPorMes(`${mes}-01`, `${deslocarMes(mes, 1)}-01`),
    saldoAtualDasContas(),
    contarSemCategoria(),
    alertasDisparados(hoje),
    previsoesDoMes(hoje),
  ]);
  const dre = montarDre([mes], linhas, categorias, somas, mix);
  const n = numerosDoMes(dre, mes);
  const aPagar = previsoes.filter((p) => !p.pagoNoMes);

  const resumo = {
    data: hoje,
    mes: rotuloMes(mes),
    saldo: formatarCentavos(saldo.saldoCentavos),
    receita: formatarCentavos(n.receita),
    resultado: formatarCentavos(n.resultado),
    semCategoria,
    alertas: alertas.map((a) => a.titulo),
    previstos: aPagar.map((p) => `${rotuloDia(p.dataPrevista)} · ${p.nome} · ${formatarCentavos(-p.valorCentavos)}`),
    previstoTotal: formatarCentavos(-aPagar.reduce((acc, p) => acc + p.valorCentavos, 0)),
  };

  const chave = process.env.RESEND_API_KEY;
  const para = process.env.RESUMO_EMAIL_PARA;
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  let email: "enviado" | "nao_configurado" | string = "nao_configurado";
  if (chave && para) {
    const linhasHtml = (itens: string[], vazio: string) =>
      itens.length === 0 ? `<p style="color:#4f4350">${vazio}</p>` : `<ul>${itens.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;color:#271f30">
        <h2 style="margin:0 0 4px">Safran · Financeiro</h2>
        <p style="margin:0 0 16px;color:#4f4350">Resumo de ${resumo.mes}, em ${rotuloDia(hoje)}</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 0">Saldo em conta</td><td style="text-align:right;font-weight:600">${resumo.saldo}</td></tr>
          <tr><td style="padding:6px 0">Receita no mês</td><td style="text-align:right;font-weight:600">${resumo.receita}</td></tr>
          <tr><td style="padding:6px 0">Resultado no mês</td><td style="text-align:right;font-weight:600">${resumo.resultado}</td></tr>
          <tr><td style="padding:6px 0">Sem categoria</td><td style="text-align:right;font-weight:600">${semCategoria}</td></tr>
        </table>
        <h3 style="margin:20px 0 6px">Alertas</h3>
        ${linhasHtml(resumo.alertas, "Nenhum alerta.")}
        <h3 style="margin:20px 0 6px">Previsto nos próximos 30 dias · ${resumo.previstoTotal}</h3>
        ${linhasHtml(resumo.previstos, "Nada recorrente previsto.")}
        ${base ? `<p style="margin-top:24px"><a href="${base}" style="color:#842a9b">Abrir o sistema</a></p>` : ""}
      </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESUMO_EMAIL_DE ?? "Safran Financeiro <onboarding@resend.dev>",
        to: para.split(",").map((e) => e.trim()),
        subject: `Resumo financeiro · ${resumo.mes} · ${alertas.length} alerta(s)`,
        html,
      }),
    });
    email = res.ok ? "enviado" : `falhou (${res.status}): ${(await res.text()).slice(0, 200)}`;
  }

  return NextResponse.json({ email, resumo }, { status: email.startsWith("falhou") ? 500 : 200 });
}
