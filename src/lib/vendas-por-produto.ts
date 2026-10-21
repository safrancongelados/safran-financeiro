/**
 * O mix de vendas da loja (Cardápio Web) por mês e linha de produto — leitura
 * do texto colado em Configurações › Loja e as regras de classificação dos
 * itens. Sem I/O.
 */
import type { LinhaProduto } from "@/db/schema";
import { normalizarTexto } from "./regras";

const LINHAS: LinhaProduto[] = ["marmitas", "porcoes", "dietas", "personal_chef"];

const APELIDOS: Record<string, LinhaProduto> = {
  marmitas: "marmitas",
  marmita: "marmitas",
  porcoes: "porcoes",
  porcao: "porcoes",
  dietas: "dietas",
  dieta: "dietas",
  personal_chef: "personal_chef",
  "personal chef": "personal_chef",
  personal: "personal_chef",
};

export interface VendaLida {
  mes: string;
  linha: LinhaProduto;
  valorCentavos: number;
  pedidos: number;
}

/** "23471,10" ou "23471.10" → 2347110. */
function lerReais(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/**
 * Lê linhas `mes;linha;valor;pedidos` (separador `;`, `,` ou tab; cabeçalho
 * opcional). Valor em reais; pedidos opcional.
 */
export function lerCsvDeVendas(texto: string): { linhas: VendaLida[] } | { erro: string } {
  const linhas: VendaLida[] = [];
  const brutas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, bruta] of brutas.entries()) {
    const partes = bruta.split(/\t|;|,(?=\s*(?:20\d\d-|[a-z]))/i).map((p) => p.trim());
    if (i === 0 && /^m[eê]s/i.test(partes[0] ?? "")) continue;
    const [mes, linhaTexto, valorTexto, pedidosTexto] = partes;
    if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { erro: `Linha ${i + 1}: mês inválido ("${mes ?? ""}"); use AAAA-MM.` };
    const linha = APELIDOS[normalizarTexto(linhaTexto ?? "").replace(/-/g, "_")];
    if (!linha) return { erro: `Linha ${i + 1}: produto desconhecido ("${linhaTexto ?? ""}"); use ${LINHAS.join(", ")}.` };
    const valorCentavos = lerReais(valorTexto ?? "");
    if (valorCentavos === null) return { erro: `Linha ${i + 1}: valor inválido ("${valorTexto ?? ""}").` };
    const pedidos = pedidosTexto ? Number(pedidosTexto) : 0;
    if (!Number.isInteger(pedidos) || pedidos < 0) return { erro: `Linha ${i + 1}: pedidos inválido ("${pedidosTexto}").` };
    linhas.push({ mes, linha, valorCentavos, pedidos });
  }
  return { linhas };
}

/**
 * A linha de produto de um item vendido na loja: "dieta" no nome vence,
 * depois "personal chef", depois a categoria de porções; o resto é marmita.
 */
export function linhaDoItem(nome: string, categoria: string | null): LinhaProduto {
  const n = normalizarTexto(nome);
  if (n.includes("dieta")) return "dietas";
  if (n.includes("personal chef")) return "personal_chef";
  if (categoria && normalizarTexto(categoria).includes("porc")) return "porcoes";
  return "marmitas";
}
