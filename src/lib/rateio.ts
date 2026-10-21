/**
 * Rateio da receita pelos pedidos do Cardápio Web. Sem I/O.
 *
 * O extrato diz quanto entrou, mas não o que foi vendido: Tuna, maquininha e
 * Pix caem todos na mesma categoria de venda. Os pedidos do Cardápio Web
 * sabem o produto. Aqui o recebido do mês nas categorias marcadas como
 * "rateadas" é repartido entre as categorias da DRE na proporção do que os
 * pedidos venderam em cada uma — o total do mês não muda um centavo, então a
 * DRE continua fechando com o caixa.
 */
import type { SomaMensal } from "./dre";

/** Quanto os pedidos venderam no mês em cada categoria da DRE (nula = sem mapeamento). */
export interface VendaPorPedidos {
  mes: string;
  categoriaId: string | null;
  centavos: number;
}

export interface RateioDoMes {
  mes: string;
  /** O que entrou no banco nas categorias rateadas. */
  recebidoCentavos: number;
  /** O que os pedidos venderam (soma dos itens, sem cancelados). */
  vendidoCentavos: number;
  /** Se o mês foi de fato repartido (precisa de recebido e de pedidos). */
  rateado: boolean;
}

export interface ResultadoRateio {
  somas: SomaMensal[];
  meses: RateioDoMes[];
}

/**
 * Reparte `total` entre as chaves na proporção dos `pesos`, em inteiros que
 * somam exatamente `total` (maior resto). Peso zero não recebe nada.
 */
export function repartir(total: number, pesos: Map<string, number>): Map<string, number> {
  const somaPesos = [...pesos.values()].reduce((acc, p) => acc + Math.max(0, p), 0);
  const resultado = new Map<string, number>();
  if (somaPesos <= 0) return resultado;

  const sinal = total < 0 ? -1 : 1;
  const alvo = Math.abs(total);
  let distribuido = 0;
  const restos: { chave: string; resto: number }[] = [];
  for (const [chave, peso] of pesos) {
    if (peso <= 0) continue;
    const exato = (alvo * peso) / somaPesos;
    const inteiro = Math.floor(exato);
    resultado.set(chave, inteiro);
    distribuido += inteiro;
    restos.push({ chave, resto: exato - inteiro });
  }
  restos.sort((a, b) => b.resto - a.resto || a.chave.localeCompare(b.chave));
  for (let i = 0; distribuido < alvo && i < restos.length; i++, distribuido++) {
    const chave = restos[i].chave;
    resultado.set(chave, (resultado.get(chave) ?? 0) + 1);
  }
  for (const [chave, v] of resultado) resultado.set(chave, v * sinal);
  return resultado;
}

/**
 * Aplica o rateio às somas por mês e categoria que alimentam a DRE.
 *
 * - `rateadas`: as categorias cujo recebido é repartido (normalmente a venda
 *   genérica, "Vendas de marmitas e porções").
 * - `padraoId`: para onde vai a venda de pedidos sem mapeamento — a primeira
 *   categoria rateada. Sem nenhuma rateada, nada acontece.
 *
 * Mês sem recebido nas rateadas, ou sem pedidos, fica como está.
 */
export function ratearPorPedidos(
  somas: SomaMensal[],
  rateadas: Set<string>,
  vendas: VendaPorPedidos[],
  padraoId: string | null
): ResultadoRateio {
  if (rateadas.size === 0 || !padraoId) return { somas, meses: [] };

  const recebidoPorMes = new Map<string, number>();
  for (const s of somas) {
    if (s.categoriaId && rateadas.has(s.categoriaId)) {
      recebidoPorMes.set(s.mes, (recebidoPorMes.get(s.mes) ?? 0) + s.valorCentavos);
    }
  }
  const vendidoPorMes = new Map<string, Map<string, number>>();
  for (const v of vendas) {
    const porCategoria = vendidoPorMes.get(v.mes) ?? new Map<string, number>();
    const chave = v.categoriaId ?? padraoId;
    porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + v.centavos);
    vendidoPorMes.set(v.mes, porCategoria);
  }

  const meses: RateioDoMes[] = [];
  const mesesRateados = new Set<string>();
  const todos = new Set([...recebidoPorMes.keys(), ...vendidoPorMes.keys()]);
  for (const mes of [...todos].sort()) {
    const recebido = recebidoPorMes.get(mes) ?? 0;
    const porCategoria = vendidoPorMes.get(mes);
    const vendido = porCategoria ? [...porCategoria.values()].reduce((acc, v) => acc + v, 0) : 0;
    const rateado = recebido !== 0 && vendido > 0;
    if (rateado) mesesRateados.add(mes);
    meses.push({ mes, recebidoCentavos: recebido, vendidoCentavos: vendido, rateado });
  }

  const resultado: SomaMensal[] = somas.filter((s) => !(s.categoriaId && rateadas.has(s.categoriaId) && mesesRateados.has(s.mes)));
  for (const mes of mesesRateados) {
    const partes = repartir(recebidoPorMes.get(mes)!, vendidoPorMes.get(mes)!);
    for (const [categoriaId, valorCentavos] of partes) {
      if (valorCentavos !== 0) resultado.push({ mes, categoriaId, valorCentavos });
    }
  }
  return { somas: resultado, meses };
}
