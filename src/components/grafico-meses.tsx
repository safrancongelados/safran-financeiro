"use client";

import { useEffect, useRef, useState } from "react";
import { formatarCentavos } from "@/lib/dinheiro";
import { rotuloMes, rotuloMesAno, rotuloMesCurto } from "@/lib/periodo";
import type { PontoDoGrafico } from "@/lib/resumo";
import { cn } from "@/lib/utils";

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const compacto = (centavos: number) => COMPACTO.format(centavos / 100);

/** Passo "redondo" (1, 2, 2,5, 5 × 10^k) para dividir o eixo em ~4 faixas. */
function passoBonito(amplitude: number): number {
  const bruto = amplitude / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / potencia;
  const base = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  return base * potencia;
}

const ALTURA = 220;
const MARGEM = { topo: 18, direita: 12, baixo: 26, esquerda: 52 };

/**
 * Receita (colunas) e resultado (linha) dos últimos 12 meses, no mesmo eixo
 * em reais. O mês corrente, ainda em andamento, aparece mais claro. Passar o
 * mouse (ou o foco) por um mês mostra os dois valores.
 */
export function GraficoMeses({ pontos, mesParcial }: { pontos: PontoDoGrafico[]; mesParcial?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setLargura(Math.max(280, Math.floor(entry.contentRect.width))));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const valores = pontos.flatMap((p) => [p.receita, p.resultado]);
  const maximo = Math.max(1, ...valores);
  const minimo = Math.min(0, ...valores);
  const passo = passoBonito(maximo - minimo);
  const topo = Math.ceil(maximo / passo) * passo;
  const fundo = Math.floor(minimo / passo) * passo;
  const ticks: number[] = [];
  for (let v = fundo; v <= topo + passo / 2; v += passo) ticks.push(v);

  const plotLargura = largura - MARGEM.esquerda - MARGEM.direita;
  const plotAltura = ALTURA - MARGEM.topo - MARGEM.baixo;
  const faixa = plotLargura / Math.max(1, pontos.length);
  const larguraColuna = Math.min(24, Math.max(6, faixa * 0.5));
  const y = (v: number) => MARGEM.topo + ((topo - v) / (topo - fundo || 1)) * plotAltura;
  const xCentro = (i: number) => MARGEM.esquerda + faixa * i + faixa / 2;
  const yZero = y(0);

  const maiorReceita = pontos.reduce((m, p, i) => (p.receita > pontos[m].receita ? i : m), 0);
  // Faixa estreita (celular): um rótulo a cada dois ou três meses, senão eles se atropelam.
  const passoRotulo = faixa >= 44 ? 1 : faixa >= 26 ? 2 : 3;
  const rotuloDoMes = (mes: string, i: number) =>
    faixa >= 44 && (i === 0 || mes.endsWith("-01")) ? rotuloMesAno(mes) : rotuloMesCurto(mes);
  const caminhoLinha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${xCentro(i).toFixed(1)},${y(p.resultado).toFixed(1)}`).join(" ");
  const p = ativo !== null ? pontos[ativo] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={largura}
        height={ALTURA}
        viewBox={`0 0 ${largura} ${ALTURA}`}
        role="img"
        aria-label="Receita e resultado por mês"
        className="block max-w-full text-[11px]"
        onMouseLeave={() => setAtivo(null)}
      >
        {/* Grade e eixo */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--color-faint)" : "var(--color-border)"}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text x={MARGEM.esquerda - 8} y={y(v) + 3.5} textAnchor="end" fill="var(--color-faint)">
              {compacto(v)}
            </text>
          </g>
        ))}

        {/* Colunas da receita */}
        {pontos.map((ponto, i) => {
          const h = Math.abs(y(ponto.receita) - yZero);
          const x = xCentro(i) - larguraColuna / 2;
          const yTopo = Math.min(y(ponto.receita), yZero);
          const r = Math.min(4, h / 2, larguraColuna / 2);
          const parcial = ponto.mes === mesParcial;
          return (
            <path
              key={ponto.mes}
              d={
                h <= 0
                  ? ""
                  : `M${x},${yTopo + h} V${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} H${x + larguraColuna - r} Q${x + larguraColuna},${yTopo} ${x + larguraColuna},${yTopo + r} V${yTopo + h} Z`
              }
              fill="var(--color-primary)"
              opacity={parcial ? 0.45 : ativo === null || ativo === i ? 0.9 : 0.55}
            />
          );
        })}

        {/* Linha do resultado */}
        <path d={caminhoLinha} fill="none" stroke="var(--color-foreground)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((ponto, i) => (
          <circle
            key={ponto.mes}
            cx={xCentro(i)}
            cy={y(ponto.resultado)}
            r={ativo === i ? 5 : 4}
            fill="var(--color-foreground)"
            stroke="var(--color-card)"
            strokeWidth={2}
          />
        ))}

        {/* Rótulos diretos: a maior receita e o mês mais recente */}
        {pontos.map((ponto, i) =>
          (i === maiorReceita || i === pontos.length - 1) && ponto.receita > 0 && ativo === null ? (
            <text
              key={ponto.mes}
              x={xCentro(i)}
              y={Math.min(y(ponto.receita), yZero) - 5}
              textAnchor="middle"
              fill="var(--color-muted-foreground)"
              className="font-medium"
            >
              {compacto(ponto.receita)}
            </text>
          ) : null
        )}

        {/* Eixo dos meses */}
        {pontos.map((ponto, i) =>
          i % passoRotulo === 0 || ativo === i ? (
            <text
              key={ponto.mes}
              x={xCentro(i)}
              y={ALTURA - 8}
              textAnchor="middle"
              fill={ativo === i ? "var(--color-foreground)" : "var(--color-faint)"}
              className={cn(ativo === i && "font-semibold")}
            >
              {rotuloDoMes(ponto.mes, i)}
            </text>
          ) : null
        )}

        {/* Alvos do hover: a faixa inteira de cada mês */}
        {pontos.map((ponto, i) => (
          <rect
            key={ponto.mes}
            x={MARGEM.esquerda + faixa * i}
            y={MARGEM.topo}
            width={faixa}
            height={plotAltura + MARGEM.baixo}
            fill="transparent"
            tabIndex={0}
            aria-label={`${rotuloMes(ponto.mes)}: receita ${formatarCentavos(ponto.receita)}, resultado ${formatarCentavos(ponto.resultado)}`}
            onMouseEnter={() => setAtivo(i)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
            className="outline-none"
          />
        ))}
      </svg>

      {p && ativo !== null ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-border bg-card p-2.5 text-xs shadow-elevation-2"
          style={{
            left: Math.min(Math.max(0, xCentro(ativo) - 88), largura - 176),
          }}
        >
          <p className="mb-1 font-semibold text-foreground">
            {rotuloMes(p.mes)}
            {p.mes === mesParcial ? <span className="font-normal text-muted-foreground"> · em andamento</span> : null}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-2.5 rounded-sm bg-primary" /> Receita
            </span>
            <span className="tabular-nums text-foreground">{formatarCentavos(p.receita)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-2.5 rounded-full bg-foreground" /> Resultado
            </span>
            <span className={cn("tabular-nums", p.resultado < 0 ? "text-destructive" : "text-foreground")}>
              {formatarCentavos(p.resultado)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A legenda do gráfico, para o cabeçalho do cartão. */
export function LegendaGrafico() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-primary" /> Receita bruta
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full bg-foreground" /> Resultado
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-primary/45" /> mês em andamento
      </span>
    </div>
  );
}
