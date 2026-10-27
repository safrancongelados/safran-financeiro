import { History } from "lucide-react";
import { listarAuditoria } from "@/db/queries/relatorios";
import { ACAO_LABEL, ALVO_LABEL, type AlvoAuditoria } from "@/lib/auditoria";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Maceio",
});

/** O detalhe em uma linha: "Pix enviado Maria: Sem categoria → Salários (mais 12 iguais)". */
function descrever(detalhe: unknown): string {
  if (!detalhe || typeof detalhe !== "object") return "";
  const d = detalhe as Record<string, unknown>;
  const partes: string[] = [];
  const texto = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
  const descricao = texto(d.descricao) ?? texto(d.nome) ?? texto(d.padrao) ?? texto(d.email);
  if (descricao) partes.push(descricao);
  if ("de" in d || "para" in d) partes.push(`${texto(d.de) ?? "sem categoria"} → ${texto(d.para) ?? "sem categoria"}`);
  if (typeof d.escopo === "string") partes.push(`escopo: ${d.escopo}`);
  if (typeof d.iguais === "number" && d.iguais > 0) partes.push(`mais ${d.iguais} igual(is)`);
  if (typeof d.lancamentos === "number") partes.push(`${d.lancamentos} lançamento(s)`);
  if (typeof d.regras === "number") partes.push(`${d.regras} regra(s)`);
  if (typeof d.alteradas === "number") partes.push(`${d.alteradas} alterada(s)`);
  if (typeof d.papel === "string") partes.push(`papel: ${d.papel}`);
  if (typeof d.ativo === "boolean") partes.push(d.ativo ? "ativado" : "desativado");
  if (typeof d.tipo === "string") partes.push(d.tipo);
  return partes.join(" · ");
}

export default async function HistoricoPage({ searchParams }: PageProps<"/configuracoes/historico">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const alvoId = typeof params.alvo === "string" && /^[0-9a-f-]{36}$/i.test(params.alvo) ? params.alvo : undefined;
  const registros = await listarAuditoria({ q: q || undefined, alvoId, limite: 300 });

  return (
    <>
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/configuracoes/historico">
        <Input name="q" defaultValue={q} placeholder="Buscar por pessoa, ação ou texto" aria-label="Buscar no histórico" className="h-9 max-w-sm" />
        <Button type="submit" size="sm" variant="secondary">
          Buscar
        </Button>
        {q || alvoId ? (
          <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
            <a href="/configuracoes/historico">Limpar</a>
          </Button>
        ) : null}
        <p className="ml-auto text-xs text-muted-foreground">Os 300 registros mais recentes{q ? " com esse texto" : ""}.</p>
      </form>

      {registros.length === 0 ? (
        <EmptyState icon={History} title="Nada registrado" description="Cada edição de categoria, nome, regra, pessoa ou estrutura passa a deixar um registro aqui." />
      ) : (
        <Card className="overflow-hidden py-0">
          <ul className="divide-y divide-border">
            {registros.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground">{DATA_HORA.format(r.createdAt)}</span>
                <span className="font-medium text-foreground">{r.usuarioNome}</span>
                <span className="text-muted-foreground">
                  {ACAO_LABEL[r.acao] ?? r.acao} {ALVO_LABEL[r.alvoTipo as AlvoAuditoria] ?? r.alvoTipo}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground" title={descrever(r.detalhe)}>
                  {descrever(r.detalhe)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
