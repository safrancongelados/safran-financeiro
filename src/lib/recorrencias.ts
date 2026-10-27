/**
 * Pagamentos recorrentes previstos: olha as saídas dos últimos meses,
 * agrupadas por iguais, e o que se repete todo mês em dia parecido vira
 * previsão para os próximos 30 dias — aluguel, DAS, folha, fornecedor fixo.
 * Sem I/O.
 */
import { agruparIguais, type MovimentacaoAgrupavel } from "./extrato";
import { regraAPartirDe } from "./regras";

export interface Previsao {
  nome: string;
  /** Texto que encontra as linhas na busca do extrato. */
  busca: string;
  categoriaNome: string | null;
  /** Dia do mês em que costuma sair (mediana). */
  dia: number;
  /** YYYY-MM-DD da próxima ocorrência esperada. */
  dataPrevista: string;
  /** Valor típico (mediana), negativo. */
  valorCentavos: number;
  /** Em quantos dos últimos meses apareceu. */
  mesesComMovimento: number;
  /** Já saiu neste mês? */
  pagoNoMes: boolean;
}

interface Mov extends MovimentacaoAgrupavel {
  categoriaNome: string | null;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

function dataNoMes(mes: string, dia: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

function deslocar(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `saidas`: saídas em conta dos últimos `janelaMeses` meses fechados mais
 * o corrente. Recorrente = apareceu em ao menos `minimoMeses` dos meses
 * fechados da janela. Devolve as previsões que caem nos próximos 30 dias a
 * partir de `hoje`, ordenadas pela data.
 */
export function preverRecorrencias(saidas: Mov[], hoje: string, janelaMeses = 4, minimoMeses = 3): Previsao[] {
  const mesCorrente = hoje.slice(0, 7);
  const fechados = Array.from({ length: janelaMeses }, (_, i) => deslocar(mesCorrente, -(janelaMeses - i)));
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 30);
  const ateData = limite.toISOString().slice(0, 10);

  const grupos = agruparIguais(saidas.filter((s) => s.valorCentavos < 0));
  const previsoes: Previsao[] = [];
  for (const g of grupos) {
    const linhas = saidas.filter((s) => {
      const id = regraAPartirDe(s);
      const idG = regraAPartirDe(g.exemplo);
      return id && idG && id.campo === idG.campo && id.padrao === idG.padrao && id.sentido === idG.sentido;
    });
    // Um lançamento por mês (o maior, se houver vários), só nos meses fechados.
    const porMes = new Map<string, Mov>();
    for (const l of linhas) {
      const mes = l.data.slice(0, 7);
      const atual = porMes.get(mes);
      if (!atual || l.valorCentavos < atual.valorCentavos) porMes.set(mes, l);
    }
    const nosFechados = fechados.filter((m) => porMes.has(m));
    if (nosFechados.length < minimoMeses) continue;
    const dias = nosFechados.map((m) => Number(porMes.get(m)!.data.slice(8, 10)));
    const valores = nosFechados.map((m) => porMes.get(m)!.valorCentavos);
    const dia = mediana(dias);
    const pagoNoMes = porMes.has(mesCorrente);
    // Próxima: neste mês se ainda não saiu e o dia não passou muito; senão no mês que vem.
    const nesteMes = dataNoMes(mesCorrente, dia);
    const dataPrevista = !pagoNoMes && nesteMes >= hoje ? nesteMes : dataNoMes(deslocar(mesCorrente, 1), dia);
    if (dataPrevista > ateData) continue;
    const exemplo = porMes.get(nosFechados[nosFechados.length - 1])!;
    previsoes.push({
      nome: exemplo.nomeExibicao ?? g.descricao,
      busca: g.busca,
      categoriaNome: exemplo.categoriaNome,
      dia,
      dataPrevista,
      valorCentavos: mediana(valores),
      mesesComMovimento: nosFechados.length,
      pagoNoMes,
    });
  }
  return previsoes.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista) || a.valorCentavos - b.valorCentavos);
}
