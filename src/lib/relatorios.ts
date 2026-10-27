/**
 * Os relatórios de pessoal, custos, fornecedores e impostos: contas puras
 * sobre somas que as queries já trouxeram. Sem I/O.
 */

/** Uma soma por mês e por chave (pessoa, categoria, fornecedor...). */
export interface SomaPorChave {
  chave: string;
  mes: string;
  valorCentavos: number;
  lancamentos: number;
}

export interface LinhaMensal {
  chave: string;
  porMes: Record<string, number>;
  lancamentosPorMes: Record<string, number>;
  total: number;
  lancamentos: number;
  /** Média dos meses com movimento. */
  media: number;
  mesesComMovimento: number;
}

/** Pivot de somas em linhas com uma coluna por mês. Ordena pelo total absoluto. */
export function pivotarPorMes(somas: SomaPorChave[], meses: string[]): LinhaMensal[] {
  const linhas = new Map<string, LinhaMensal>();
  for (const s of somas) {
    if (!meses.includes(s.mes)) continue;
    let l = linhas.get(s.chave);
    if (!l) {
      l = { chave: s.chave, porMes: {}, lancamentosPorMes: {}, total: 0, lancamentos: 0, media: 0, mesesComMovimento: 0 };
      linhas.set(s.chave, l);
    }
    l.porMes[s.mes] = (l.porMes[s.mes] ?? 0) + s.valorCentavos;
    l.lancamentosPorMes[s.mes] = (l.lancamentosPorMes[s.mes] ?? 0) + s.lancamentos;
    l.total += s.valorCentavos;
    l.lancamentos += s.lancamentos;
  }
  for (const l of linhas.values()) {
    l.mesesComMovimento = Object.values(l.porMes).filter((v) => v !== 0).length;
    l.media = l.mesesComMovimento > 0 ? Math.round(l.total / l.mesesComMovimento) : 0;
  }
  return [...linhas.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/**
 * Tendência: a média dos últimos `n` meses do período contra a média dos
 * `n` anteriores, em fração (0,25 = 25% a mais). Nulo sem base de comparação.
 */
export function tendencia(linha: LinhaMensal, meses: string[], n = 3): number | null {
  if (meses.length < 2 * n) return null;
  const recentes = meses.slice(-n);
  const anteriores = meses.slice(-2 * n, -n);
  const soma = (ms: string[]) => ms.reduce((acc, m) => acc + (linha.porMes[m] ?? 0), 0);
  const antes = soma(anteriores);
  if (antes === 0) return null;
  return (soma(recentes) - antes) / Math.abs(antes);
}

/** Variação de um mês contra o anterior, em fração. Nulo sem base. */
export function variacaoMensal(linha: LinhaMensal, mes: string, mesAnterior: string): number | null {
  const antes = linha.porMes[mesAnterior] ?? 0;
  if (antes === 0) return null;
  return ((linha.porMes[mes] ?? 0) - antes) / Math.abs(antes);
}

/** Categorias que são imposto, pelo nome — o plano de contas é editável, então é por padrão de nome. */
export function eCategoriaDeImposto(nome: string): boolean {
  return /simples|tribut|imposto|darf|\biss\b|icms|inss|fgts|\bdas\b/i.test(nome);
}

/** Categorias de pessoal, pelo nome ou pela linha da DRE em que somam. */
export function eCategoriaDePessoal(nome: string, linha: string): boolean {
  return /sócios|socios|pessoal|folha/i.test(linha) || /sal[aá]ri|pr[oó]-?labore|folha|encargos|funcion[aá]rio|freela/i.test(nome);
}
