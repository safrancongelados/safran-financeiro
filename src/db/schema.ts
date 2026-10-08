import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Regra de ouro: todo valor em dinheiro é INTEIRO EM CENTAVOS. Conta em float
// gera divergência de centavo entre a DRE e o extrato do banco.

/**
 * Onde cada categoria cai na DRE. Os quatro últimos ficam fora da DRE e só
 * aparecem no fluxo de caixa: mexem no saldo, mas não são receita nem despesa.
 */
export const grupoDreEnum = pgEnum("grupo_dre", [
  "receita",
  "deducao",
  "custo_variavel",
  "despesa_fixa",
  "financeiro",
  "investimento",
  "financiamento",
  "socios",
  "transferencia",
]);

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

/** Plano de contas. Desativar esconde dos seletores sem apagar o histórico. */
export const categorias = pgTable("categorias", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  grupo: grupoDreEnum("grupo").notNull(),
  ordem: integer("ordem").notNull().default(0),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Regra de categorização automática: "o que vier desta contraparte vai para
 * esta categoria". Nasce quando alguém categoriza uma movimentação e escolhe
 * aplicar às outras da mesma contraparte.
 */
export const regrasCategorizacao = pgTable(
  "regras_categorizacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "cascade" }),
    campo: campoRegraEnum("campo").notNull(),
    /** Documento: só dígitos, igualdade. Texto: trecho, sem acento nem caixa. */
    padrao: text("padrao").notNull(),
    sentido: sentidoRegraEnum("sentido").notNull().default("ambos"),
    /** Como o extrato mostra o que casa com a regra ("José (cozinha)"). Nulo = a descrição do banco. */
    nomeExibicao: text("nome_exibicao"),
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
    /**
     * A regra que casa com a linha, mesmo quando a categoria foi escolhida à
     * mão: é dela que vem o nome de exibição. Gravada por aplicarRegras.
     */
    regraId: uuid("regra_id").references(() => regrasCategorizacao.id, { onDelete: "set null" }),
    payloadBruto: jsonb("payload_bruto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movimentacao_conta_data_idx").on(t.contaId, t.data),
    index("movimentacao_data_idx").on(t.data),
    index("movimentacao_categoria_idx").on(t.categoriaId),
    index("movimentacao_regra_idx").on(t.regraId),
  ]
);

export type GrupoDre = (typeof grupoDreEnum.enumValues)[number];
export type CampoRegra = (typeof campoRegraEnum.enumValues)[number];
export type SentidoRegra = (typeof sentidoRegraEnum.enumValues)[number];
export type Categoria = typeof categorias.$inferSelect;
export type Regra = typeof regrasCategorizacao.$inferSelect;
