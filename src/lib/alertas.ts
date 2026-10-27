/**
 * O motor de alertas: recebe a configuração e os dados já lidos do banco e
 * decide o que avisar. Sem I/O, para dar para testar cada regra com números
 * na mão.
 */
import type { TipoAlerta } from "@/db/schema";
import { formatarCentavos } from "./dinheiro";
import { rotuloDia, rotuloMesAno } from "./periodo";

export interface ConfigAlerta {
  tipo: TipoAlerta;
  parametros: Record<string, unknown>;
  ativo: boolean;
}

/** O que cada tipo aceita, com o padrão e o texto da tela. */
export interface CampoParametro {
  chave: string;
  rotulo: string;
  /** "reais" é guardado em centavos. */
  formato: "reais" | "percentual" | "dias";
  padrao: number;
}

export const ALERTA_INFO: Record<TipoAlerta, { titulo: string; descricao: string; campos: CampoParametro[] }> = {
  saldo_minimo: {
    titulo: "Saldo abaixo do mínimo",
    descricao: "Avisa quando o saldo em conta fica abaixo do valor.",
    campos: [{ chave: "valorCentavos", rotulo: "Saldo mínimo", formato: "reais", padrao: 500000 }],
  },
  despesa_acima_media: {
    titulo: "Categoria acima da média",
    descricao: "Último mês fechado de uma categoria de custo acima da média dos três meses anteriores.",
    campos: [
      { chave: "percentual", rotulo: "Acima de (%)", formato: "percentual", padrao: 30 },
      { chave: "minimoCentavos", rotulo: "Só a partir de", formato: "reais", padrao: 50000 },
    ],
  },
  lancamento_grande_sem_categoria: {
    titulo: "Lançamento grande sem categoria",
    descricao: "Um valor alto fora da DRE por falta de categoria.",
    campos: [{ chave: "valorCentavos", rotulo: "A partir de", formato: "reais", padrao: 100000 }],
  },
  pessoa_acima_meta: {
    titulo: "Pessoa acima da meta",
    descricao: "Funcionário ou sócio recebeu no mês mais do que a meta cadastrada.",
    campos: [],
  },
  fornecedor_novo: {
    titulo: "Fornecedor novo com valor alto",
    descricao: "Contraparte que nunca tinha recebido e recebeu acima do valor nos últimos dias.",
    campos: [
      { chave: "valorCentavos", rotulo: "A partir de", formato: "reais", padrao: 100000 },
      { chave: "dias", rotulo: "Nos últimos (dias)", formato: "dias", padrao: 30 },
    ],
  },
  sync_parado: {
    titulo: "Extrato parado",
    descricao: "Nenhum lançamento novo há mais dias do que o normal.",
    campos: [{ chave: "dias", rotulo: "Depois de (dias)", formato: "dias", padrao: 3 }],
  },
  imposto_previsto: {
    titulo: "Imposto do mês ainda não saiu",
    descricao: "Um imposto que costuma ser pago até certo dia ainda não apareceu neste mês.",
    campos: [{ chave: "toleranciaDias", rotulo: "Tolerância (dias)", formato: "dias", padrao: 3 }],
  },
};

export function parametro(config: ConfigAlerta, chave: string): number {
  const v = config.parametros[chave];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return ALERTA_INFO[config.tipo].campos.find((c) => c.chave === chave)?.padrao ?? 0;
}

export interface AlertaDisparado {
  tipo: TipoAlerta;
  gravidade: "alta" | "media";
  titulo: string;
  detalhe: string;
  href: string;
  acao: string;
}

/** Tudo que o motor precisa, já lido do banco. */
export interface DadosParaAlertas {
  /** YYYY-MM-DD */
  hoje: string;
  saldoCentavos: number;
  /** Data do último lançamento em conta, ou nulo. */
  ultimaData: string | null;
  /** Por categoria de custo: o último mês fechado e os três anteriores. */
  categorias: { id: string; nome: string; ultimoMes: string; ultimo: number; anteriores: number[] }[];
  semCategoriaGrandes: { id: string; data: string; descricao: string; valorCentavos: number }[];
  pessoasComMeta: { id: string; nome: string; metaCentavos: number; pagoNoMes: number }[];
  fornecedoresNovos: { nome: string; primeiraData: string; totalCentavos: number; lancamentos: number }[];
  /** Por categoria de imposto: em que dia do mês costuma ser pago e se já saiu neste mês. */
  impostos: { id: string; nome: string; diaHabitual: number; mesesComPagamento: number; pagoNoMes: boolean }[];
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function avaliarAlertas(configs: ConfigAlerta[], d: DadosParaAlertas): AlertaDisparado[] {
  const saida: AlertaDisparado[] = [];
  const mes = d.hoje.slice(0, 7);
  const dia = Number(d.hoje.slice(8, 10));

  for (const c of configs) {
    if (!c.ativo) continue;
    switch (c.tipo) {
      case "saldo_minimo": {
        const minimo = parametro(c, "valorCentavos");
        if (d.saldoCentavos < minimo) {
          saida.push({
            tipo: c.tipo,
            gravidade: "alta",
            titulo: `Saldo em ${formatarCentavos(d.saldoCentavos)}, abaixo do mínimo de ${formatarCentavos(minimo)}`,
            detalhe: "Confira o fluxo de caixa antes de novos pagamentos.",
            href: "/fluxo-de-caixa",
            acao: "Ver fluxo",
          });
        }
        break;
      }
      case "despesa_acima_media": {
        const pct = parametro(c, "percentual") / 100;
        const minimo = parametro(c, "minimoCentavos");
        for (const cat of d.categorias) {
          const validos = cat.anteriores.filter((v) => v !== 0);
          if (validos.length < 2) continue;
          const media = validos.reduce((a, b) => a + b, 0) / validos.length;
          const ultimo = -cat.ultimo;
          if (ultimo < minimo || -media <= 0) continue;
          const variacao = (ultimo - -media) / -media;
          if (variacao >= pct) {
            saida.push({
              tipo: c.tipo,
              gravidade: "media",
              titulo: `${cat.nome}: ${formatarCentavos(ultimo)} em ${rotuloMesAno(cat.ultimoMes)}, ${Math.round(variacao * 100)}% acima da média`,
              detalhe: `Média dos ${validos.length} meses anteriores: ${formatarCentavos(-media)}.`,
              href: `/extrato?mes=${cat.ultimoMes}&categoria=${cat.id}`,
              acao: "Ver lançamentos",
            });
          }
        }
        break;
      }
      case "lancamento_grande_sem_categoria": {
        const minimo = parametro(c, "valorCentavos");
        // Os cinco maiores bastam: o resto está na caixa de revisão.
        for (const m of d.semCategoriaGrandes.filter((m) => Math.abs(m.valorCentavos) >= minimo).slice(0, 5)) {
          saida.push({
            tipo: c.tipo,
            gravidade: "media",
            titulo: `${formatarCentavos(m.valorCentavos)} sem categoria em ${rotuloDia(m.data)}: ${m.descricao}`,
            detalhe: "Fora da DRE até ganhar categoria.",
            href: `/extrato?mes=${m.data.slice(0, 7)}&categoria=sem`,
            acao: "Categorizar",
          });
        }
        break;
      }
      case "pessoa_acima_meta": {
        for (const p of d.pessoasComMeta) {
          if (p.pagoNoMes <= p.metaCentavos) continue;
          saida.push({
            tipo: c.tipo,
            gravidade: "media",
            titulo: `${p.nome} já recebeu ${formatarCentavos(p.pagoNoMes)} em ${rotuloMesAno(mes)}, acima da meta de ${formatarCentavos(p.metaCentavos)}`,
            detalhe: `${formatarCentavos(p.pagoNoMes - p.metaCentavos)} a mais.`,
            href: `/pessoas/${p.id}`,
            acao: "Ver pessoa",
          });
        }
        break;
      }
      case "fornecedor_novo": {
        const minimo = parametro(c, "valorCentavos");
        for (const f of d.fornecedoresNovos) {
          if (-f.totalCentavos < minimo) continue;
          saida.push({
            tipo: c.tipo,
            gravidade: "media",
            titulo: `Fornecedor novo: ${f.nome} recebeu ${formatarCentavos(-f.totalCentavos)} desde ${rotuloDia(f.primeiraData)}`,
            detalhe: `${f.lancamentos} lançamento(s). Se for recorrente, cadastre em Pessoas.`,
            href: `/extrato?periodo=3m&q=${encodeURIComponent(f.nome.slice(0, 60))}`,
            acao: "Ver lançamentos",
          });
        }
        break;
      }
      case "sync_parado": {
        const limite = parametro(c, "dias");
        if (d.ultimaData && diasEntre(d.ultimaData, d.hoje) >= limite) {
          saida.push({
            tipo: c.tipo,
            gravidade: "alta",
            titulo: `Nenhum lançamento novo desde ${rotuloDia(d.ultimaData)}`,
            detalhe: "Se houve movimento na conta, sincronize ou confira a conexão.",
            href: "/configuracoes/conexao",
            acao: "Ver conexão",
          });
        }
        break;
      }
      case "imposto_previsto": {
        const tolerancia = parametro(c, "toleranciaDias");
        for (const i of d.impostos) {
          if (i.pagoNoMes || i.mesesComPagamento < 3) continue;
          if (dia <= i.diaHabitual + tolerancia) continue;
          saida.push({
            tipo: c.tipo,
            gravidade: "alta",
            titulo: `${i.nome} ainda não saiu em ${rotuloMesAno(mes)}`,
            detalhe: `Costuma ser pago até o dia ${i.diaHabitual} (em ${i.mesesComPagamento} dos últimos meses).`,
            href: `/extrato?periodo=6m&categoria=${i.id}`,
            acao: "Ver histórico",
          });
        }
        break;
      }
    }
  }
  return saida.sort((a, b) => Number(b.gravidade === "alta") - Number(a.gravidade === "alta"));
}
