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
  primaryKey,
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

/**
 * Linhas de produto da loja. O extrato não sabe o que foi vendido, então a
 * categoria de vendas marcada como `rateada` é distribuída na DRE, mês a mês,
 * pelo mix de pedidos da loja (`vendas_por_produto`) entre as categorias que
 * têm `linha_produto`.
 */
export const linhaProdutoEnum = pgEnum("linha_produto", ["marmitas", "porcoes", "dietas", "personal_chef"]);

/** Em que campo da movimentação a regra procura o padrão. */
export const campoRegraEnum = pgEnum("campo_regra", ["documento", "contraparte", "descricao"]);
export const sentidoRegraEnum = pgEnum("sentido_regra", ["entrada", "saida", "ambos"]);
/**
 * De onde veio a categoria: de uma regra, da categoria padrão da pessoa, da
 * ida que um estorno devolve, ou escolhida à mão ("só nesta", que regra
 * nenhuma muda).
 */
export const origemCategoriaEnum = pgEnum("origem_categoria", ["regra", "manual", "pessoa", "estorno"]);

/**
 * O que cada acesso pode fazer. `dono` administra usuários; `financeiro`
 * categoriza e configura; `leitura` só vê (o contador, por exemplo).
 */
export const papelUsuarioEnum = pgEnum("papel_usuario", ["dono", "financeiro", "leitura"]);

/** Quem acessa o sistema. Sem cadastro público: contas criadas pelo dono em Configurações ou por script. */
export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelUsuarioEnum("papel").notNull().default("dono"),
  /** Desativado não entra, mas o histórico do que fez fica. */
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Funcionário, sócio, fornecedor ou cliente: quem está do outro lado do lançamento. */
export const tipoPessoaEnum = pgEnum("tipo_pessoa", ["funcionario", "socio", "fornecedor", "cliente", "outro"]);

/**
 * Cadastro de quem recebe ou paga. Uma pessoa é reconhecida pelo CPF/CNPJ
 * ou por trechos do nome que o banco manda (`padroes`, já normalizados); o
 * sync liga cada movimentação à pessoa (`movimentacoes.pessoa_id`). A
 * categoria padrão vale quando nenhuma regra decide — "tudo que vai para
 * Maria é salário" nasce aqui. A meta mensal alimenta o relatório de
 * pessoal e o alerta de pró-labore acima do combinado.
 */
export const pessoas = pgTable(
  "pessoas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    tipo: tipoPessoaEnum("tipo").notNull().default("outro"),
    /** Só dígitos; único quando informado. */
    documento: text("documento").unique(),
    /** Trechos de contraparte ou descrição, normalizados (sem acento, minúsculo). */
    padroes: text("padroes").array().notNull().default([]),
    categoriaId: uuid("categoria_id").references(() => categorias.id, { onDelete: "set null" }),
    metaMensalCentavos: integer("meta_mensal_centavos"),
    ativa: boolean("ativa").notNull().default(true),
    notas: text("notas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pessoa_tipo_idx").on(t.tipo)]
);

/**
 * Quem mudou o quê. Toda edição de categoria, nome, centro, regra, pessoa
 * ou estrutura deixa uma linha aqui, para o extrato poder responder "por
 * que esta linha está assim?".
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    /** Guardado à parte: o usuário pode ser apagado, o registro fica. */
    usuarioNome: text("usuario_nome").notNull(),
    /** categoria, nome, centro, so_nesta, lote, regra, pessoa, linha_dre, categoria_dre, usuario... */
    acao: text("acao").notNull(),
    alvoTipo: text("alvo_tipo").notNull(),
    alvoId: text("alvo_id"),
    /** O que mudou, de → para, e quantas linhas foram afetadas. */
    detalhe: jsonb("detalhe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_data_idx").on(t.createdAt), index("auditoria_alvo_idx").on(t.alvoTipo, t.alvoId)]
);

export const tipoAlertaEnum = pgEnum("tipo_alerta", [
  "saldo_minimo",
  "despesa_acima_media",
  "lancamento_grande_sem_categoria",
  "pessoa_acima_meta",
  "fornecedor_novo",
  "sync_parado",
  "imposto_previsto",
]);

/**
 * Um alerta configurável por tipo. Os parâmetros variam (valor em centavos,
 * percentual, dias); a avaliação mora em `lib/alertas.ts`.
 */
export const alertas = pgTable("alertas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: tipoAlertaEnum("tipo").notNull().unique(),
  parametros: jsonb("parametros").notNull().default({}),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uma combinação de filtros do extrato com nome, para voltar a ela num clique. */
export const visoesSalvas = pgTable("visoes_salvas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  /** A query string do extrato, sem o "?". */
  params: text("params").notNull(),
  ordem: integer("ordem").notNull().default(0),
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
  /** A categoria de vendas do extrato que a DRE rateia pelo mix da loja. Só uma. */
  rateada: boolean("rateada").notNull().default(false),
  /** Qual linha de produto esta categoria recebe no rateio. */
  linhaProduto: linhaProdutoEnum("linha_produto"),
  ordem: integer("ordem").notNull().default(0),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Vendas da loja por mês e linha de produto, em centavos — o mix que rateia
 * a categoria de vendas na DRE. Vem do Cardápio Web (pedidos fechados, sem
 * os cancelados, pelo mês de criação do pedido).
 */
export const vendasPorProduto = pgTable(
  "vendas_por_produto",
  {
    mes: text("mes").notNull(),
    linha: linhaProdutoEnum("linha").notNull(),
    valorCentavos: integer("valor_centavos").notNull().default(0),
    pedidos: integer("pedidos").notNull().default(0),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mes, t.linha] })]
);

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
    /** Quem está do outro lado, quando reconhecido pelo cadastro de pessoas. Gravado por aplicarRegras. */
    pessoaId: uuid("pessoa_id").references(() => pessoas.id, { onDelete: "set null" }),
    /** Anotação livre de quem categorizou ("adiantamento de férias"). */
    observacao: text("observacao"),
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
    index("movimentacao_pessoa_idx").on(t.pessoaId),
  ]
);

export type TipoLinhaDre = (typeof tipoLinhaDreEnum.enumValues)[number];
export type SecaoDre = (typeof secaoDreEnum.enumValues)[number];
export type PapelLinhaDre = (typeof papelLinhaDreEnum.enumValues)[number];
export type LinhaProduto = (typeof linhaProdutoEnum.enumValues)[number];
export type VendaPorProduto = typeof vendasPorProduto.$inferSelect;
export type LinhaDre = typeof linhasDre.$inferSelect;
export type CentroCusto = typeof centrosCusto.$inferSelect;
export type CampoRegra = (typeof campoRegraEnum.enumValues)[number];
export type SentidoRegra = (typeof sentidoRegraEnum.enumValues)[number];
export type Categoria = typeof categorias.$inferSelect;
export type Regra = typeof regrasCategorizacao.$inferSelect;
export type PapelUsuario = (typeof papelUsuarioEnum.enumValues)[number];
export type TipoPessoa = (typeof tipoPessoaEnum.enumValues)[number];
export type Pessoa = typeof pessoas.$inferSelect;
export type TipoAlerta = (typeof tipoAlertaEnum.enumValues)[number];
export type Alerta = typeof alertas.$inferSelect;
export type VisaoSalva = typeof visoesSalvas.$inferSelect;
