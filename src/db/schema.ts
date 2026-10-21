import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  bigint,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Regra de ouro: todo valor em dinheiro é INTEIRO EM CENTAVOS. Conta em float
// gera divergência de centavo entre a DRE e o extrato do banco.

/**
 * Linha da DRE: `grupo` soma as categorias dela; `subtotal` é a soma acumulada
 * de todos os grupos da seção `dre` acima dele (receita líquida, margem...).
 */
export const tipoLinhaDreEnum = pgEnum("tipo_linha_dre", ["grupo", "subtotal"]);
/**
 * `dre`: entra no resultado. `caixa`: fora da DRE, mas mexe no saldo
 * (investimento, empréstimo, sócios). `transferencia`: dinheiro que só muda
 * de conta da própria Safran — fora da DRE e das entradas/saídas do extrato.
 */
export const secaoDreEnum = pgEnum("secao_dre", ["dre", "caixa", "transferencia"]);
/**
 * Subtotal que alimenta os indicadores: `margem` é a margem de contribuição e
 * `operacional` o resultado operacional. Custos fixos = margem − operacional;
 * ponto de equilíbrio = custos fixos mensais ÷ margem %. Só um de cada.
 */
export const papelLinhaDreEnum = pgEnum("papel_linha_dre", ["margem", "operacional"]);

/** Em que campo da movimentação a regra procura o padrão. */
export const campoRegraEnum = pgEnum("campo_regra", ["documento", "contraparte", "descricao"]);
export const sentidoRegraEnum = pgEnum("sentido_regra", ["entrada", "saida", "ambos"]);
export const origemCategoriaEnum = pgEnum("origem_categoria", ["regra", "manual"]);

/** Quem acessa o sistema. Sem cadastro público: contas criadas por script. */
export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Estrutura da DRE, editável na aba Configurações. */
export const linhasDre = pgTable("linhas_dre", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  tipo: tipoLinhaDreEnum("tipo").notNull().default("grupo"),
  secao: secaoDreEnum("secao").notNull().default("dre"),
  ordem: integer("ordem").notNull().default(0),
  /** Linha que é o 100% dos percentuais (normalmente a receita líquida). Só uma. */
  basePercentual: boolean("base_percentual").notNull().default(false),
  /** Subtotal que mostra, embaixo, quanto é da linha base. */
  mostrarPercentual: boolean("mostrar_percentual").notNull().default(false),
  /** Subtotal usado nos indicadores (ver `papelLinhaDreEnum`). Nulo = nenhum. */
  papel: papelLinhaDreEnum("papel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Centro de custo: quem gasta (Produção, Comercial...). Vem da categoria, com exceção por regra. */
export const centrosCusto = pgTable("centros_custo", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Plano de contas. Desativar esconde dos seletores sem apagar o histórico. */
export const categorias = pgTable("categorias", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  /** Linha (do tipo grupo) da DRE em que a categoria soma. */
  linhaId: uuid("linha_id")
    .notNull()
    .references(() => linhasDre.id),
  /** Centro de custo padrão de tudo que cai nesta categoria. */
  centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "set null" }),
  ordem: integer("ordem").notNull().default(0),
  ativa: boolean("ativa").notNull().default(true),
  /**
   * Categoria de venda cujo recebido no banco é repartido, mês a mês, na
   * proporção dos pedidos do Cardápio Web (ver `lib/rateio.ts`). O extrato
   * não sabe o que foi vendido; os pedidos sabem.
   */
  rateadaPorPedidos: boolean("rateada_por_pedidos").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Regra automática: "o que vier desta contraparte vai para esta categoria,
 * aparece com este nome e conta neste centro de custo". Cada campo é
 * opcional — uma regra pode só dar nome. Nasce quando alguém edita uma linha
 * do extrato (vale para as iguais) ou na aba Configurações.
 */
export const regrasCategorizacao = pgTable(
  "regras_categorizacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nula = a regra não decide categoria (só nome ou centro). */
    categoriaId: uuid("categoria_id").references(() => categorias.id, { onDelete: "set null" }),
    campo: campoRegraEnum("campo").notNull(),
    /** Documento: só dígitos, igualdade. Texto: trecho, sem acento nem caixa. */
    padrao: text("padrao").notNull(),
    sentido: sentidoRegraEnum("sentido").notNull().default("ambos"),
    /** Como o extrato mostra o que casa com a regra ("José (cozinha)"). Nulo = a descrição do banco. */
    nomeExibicao: text("nome_exibicao"),
    /** Exceção ao centro de custo padrão da categoria. Nulo = segue a categoria. */
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("regra_campo_padrao_sentido_unq").on(t.campo, t.padrao, t.sentido)]
);

/**
 * Uma conexão com o banco na Pluggy (o "item" da API). As contas e
 * movimentações vêm da API e são atualizadas a cada sincronização.
 */
export const conexoesBancarias = pgTable("conexoes_bancarias", {
  id: uuid("id").primaryKey().defaultRandom(),
  provedor: text("provedor").notNull().default("pluggy"),
  providerItemId: text("provider_item_id").notNull().unique(),
  /** Nome do banco como a Pluggy informa (ex.: "Mercado Pago"). */
  instituicao: text("instituicao"),
  /** Status do item na Pluggy: UPDATED, OUTDATED, LOGIN_ERROR... */
  status: text("status"),
  /** Última vez que a Pluggy buscou dados no banco — não é o nosso sync. */
  dadosAtualizadosEm: timestamp("dados_atualizados_em", { withTimezone: true }),
  ultimoSyncEm: timestamp("ultimo_sync_em", { withTimezone: true }),
  ultimoSyncOk: boolean("ultimo_sync_ok"),
  ultimoSyncDetalhe: text("ultimo_sync_detalhe"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Conta dentro de uma conexão. Criada pelo sync; `tipo` é BANK ou CREDIT. */
export const contasBancarias = pgTable(
  "contas_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conexaoId: uuid("conexao_id")
      .notNull()
      .references(() => conexoesBancarias.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull().unique(),
    nome: text("nome").notNull(),
    numero: text("numero"),
    tipo: text("tipo").notNull(),
    subtipo: text("subtipo"),
    /** Conta: saldo disponível. Cartão: fatura em aberto. */
    saldoCentavos: integer("saldo_centavos").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conta_bancaria_conexao_idx").on(t.conexaoId)]
);

/**
 * Uma linha do extrato.
 *
 * `valorCentavos` tem o sinal do caixa: positivo entrou, negativo saiu. A
 * categoria é o que liga a movimentação à DRE; o sync nunca a sobrescreve —
 * só as regras (em linhas que não foram categorizadas à mão) e as pessoas.
 */
export const movimentacoesBancarias = pgTable(
  "movimentacoes_bancarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contasBancarias.id, { onDelete: "cascade" }),
    providerTransactionId: text("provider_transaction_id").notNull().unique(),
    data: date("data", { mode: "string" }).notNull(),
    descricao: text("descricao").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    /** DEBIT ou CREDIT, como na Pluggy. */
    tipo: text("tipo"),
    /** PIX, TED, BOLETO... quando o banco informa. */
    meio: text("meio"),
    /** Quem pagou (entrada) ou quem recebeu (saída). */
    contraparte: text("contraparte"),
    contraparteDocumento: text("contraparte_documento"),
    categoriaPluggy: text("categoria_pluggy"),
    categoriaId: uuid("categoria_id").references(() => categorias.id, { onDelete: "set null" }),
    /** `manual` nunca é mexida por regra. Nulo = sem categoria. */
    categorizadaPor: origemCategoriaEnum("categorizada_por"),
    /** A regra que deu a categoria (o selo "auto" do extrato leva até ela). Gravada por aplicarRegras. */
    regraId: uuid("regra_id").references(() => regrasCategorizacao.id, { onDelete: "set null" }),
    /** Nome que o extrato mostra; nulo = a descrição do banco. Vem das regras, gravado por aplicarRegras. */
    nomeExibicao: text("nome_exibicao"),
    /** Exceção da regra ou o padrão da categoria. Gravado por aplicarRegras. */
    centroCustoId: uuid("centro_custo_id").references(() => centrosCusto.id, { onDelete: "set null" }),
    payloadBruto: jsonb("payload_bruto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movimentacao_conta_data_idx").on(t.contaId, t.data),
    index("movimentacao_data_idx").on(t.data),
    index("movimentacao_categoria_idx").on(t.categoriaId),
    index("movimentacao_regra_idx").on(t.regraId),
    index("movimentacao_centro_idx").on(t.centroCustoId),
  ]
);

export type TipoLinhaDre = (typeof tipoLinhaDreEnum.enumValues)[number];
export type SecaoDre = (typeof secaoDreEnum.enumValues)[number];
export type PapelLinhaDre = (typeof papelLinhaDreEnum.enumValues)[number];
export type LinhaDre = typeof linhasDre.$inferSelect;
export type CentroCusto = typeof centrosCusto.$inferSelect;
export type CampoRegra = (typeof campoRegraEnum.enumValues)[number];
export type SentidoRegra = (typeof sentidoRegraEnum.enumValues)[number];
export type Categoria = typeof categorias.$inferSelect;
export type Regra = typeof regrasCategorizacao.$inferSelect;

// ── Cardápio Web ───────────────────────────────────────────────────────────
//
// Os pedidos da loja virtual (Cardápio Web) não entram no caixa — o caixa é
// o extrato. Eles dizem o que foi vendido: servem para repartir a receita
// recebida entre as linhas de produto da DRE e para conferir o recebido
// contra o vendido.

/** Estado da integração: uma linha só (a loja da Safran). */
export const integracaoCardapioWeb = pgTable("integracao_cardapio_web", {
  id: text("id").primaryKey().default("loja"),
  merchantUuid: text("merchant_uuid"),
  lojaNome: text("loja_nome"),
  /** Primeiro dia já coberto pelo sync (o histórico é puxado de trás para a frente). */
  cobertoDesde: date("coberto_desde", { mode: "string" }),
  ultimoSyncEm: timestamp("ultimo_sync_em", { withTimezone: true }),
  ultimoSyncOk: boolean("ultimo_sync_ok"),
  ultimoSyncDetalhe: text("ultimo_sync_detalhe"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Um pedido fechado (ou cancelado) no Cardápio Web. Valores em centavos, como
 * o resto; `data` é o dia do pedido no fuso de Maceió — o mês da DRE em que
 * ele conta para o rateio.
 */
export const pedidosCardapioWeb = pgTable(
  "pedidos_cardapio_web",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: bigint("pedido_id", { mode: "number" }).notNull().unique(),
    displayId: integer("display_id"),
    /** closed, canceled... como no Cardápio Web. */
    status: text("status").notNull(),
    /** delivery, takeout, onsite, closed_table. */
    tipo: text("tipo"),
    /** catalog (site), portal, ifood... */
    canal: text("canal"),
    origemCliente: text("origem_cliente"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull(),
    data: date("data", { mode: "string" }).notNull(),
    agendadoPara: date("agendado_para", { mode: "string" }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }),
    /** pix_auto, online_credit_card, credit_card, pix, food_voucher... */
    meioPagamento: text("meio_pagamento"),
    totalCentavos: integer("total_centavos").notNull(),
    itensCentavos: integer("itens_centavos").notNull().default(0),
    taxaEntregaCentavos: integer("taxa_entrega_centavos").notNull().default(0),
    descontoCentavos: integer("desconto_centavos").notNull().default(0),
    clienteNome: text("cliente_nome"),
    payloadBruto: jsonb("payload_bruto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pedido_cw_data_idx").on(t.data), index("pedido_cw_status_idx").on(t.status)]
);

/** Um item de um pedido, com a categoria do cardápio em que ele estava. */
export const itensPedidoCardapioWeb = pgTable(
  "itens_pedido_cardapio_web",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidosCardapioWeb.id, { onDelete: "cascade" }),
    itemPedidoId: bigint("item_pedido_id", { mode: "number" }).notNull().unique(),
    /** O item no catálogo (pode já não existir mais). */
    itemId: bigint("item_id", { mode: "number" }),
    codigoExterno: text("codigo_externo"),
    nome: text("nome").notNull(),
    /** Nome da categoria do cardápio ("Linha Performance"). Nulo = item fora do catálogo atual. */
    categoriaCw: text("categoria_cw"),
    quantidade: numeric("quantidade", { precision: 10, scale: 3, mode: "number" }).notNull().default(1),
    precoUnitarioCentavos: integer("preco_unitario_centavos").notNull().default(0),
    totalCentavos: integer("total_centavos").notNull(),
  },
  (t) => [index("item_pedido_cw_pedido_idx").on(t.pedidoId), index("item_pedido_cw_categoria_idx").on(t.categoriaCw)]
);

/**
 * Em que categoria da DRE cada categoria do cardápio vende. Nula = na
 * categoria rateada padrão (a venda genérica). Uma linha por categoria vista
 * nos pedidos, criada pelo sync e escolhida em Configurações.
 */
export const mapeamentoCardapioWeb = pgTable("mapeamento_cardapio_web", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoriaCw: text("categoria_cw").notNull().unique(),
  categoriaId: uuid("categoria_id").references(() => categorias.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PedidoCardapioWeb = typeof pedidosCardapioWeb.$inferSelect;
export type ItemPedidoCardapioWeb = typeof itensPedidoCardapioWeb.$inferSelect;
export type MapeamentoCardapioWeb = typeof mapeamentoCardapioWeb.$inferSelect;
export type IntegracaoCardapioWeb = typeof integracaoCardapioWeb.$inferSelect;
