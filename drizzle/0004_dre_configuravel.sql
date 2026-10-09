-- DRE configurável: as linhas (grupos e subtotais) e os centros de custo saem
-- do código e viram tabela, editáveis na aba Configurações. A ordem dos
-- comandos importa: as tabelas novas nascem e são semeadas antes de as
-- categorias apontarem para elas, e o enum antigo só sai depois do backfill.
CREATE TYPE "public"."secao_dre" AS ENUM('dre', 'caixa', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."tipo_linha_dre" AS ENUM('grupo', 'subtotal');--> statement-breakpoint
CREATE TABLE "centros_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centros_custo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "linhas_dre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_linha_dre" DEFAULT 'grupo' NOT NULL,
	"secao" "secao_dre" DEFAULT 'dre' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"base_percentual" boolean DEFAULT false NOT NULL,
	"mostrar_percentual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linhas_dre_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
-- A mesma cascata que estava fixa no código.
INSERT INTO "linhas_dre" ("nome", "tipo", "secao", "ordem", "base_percentual", "mostrar_percentual") VALUES
('Receita bruta', 'grupo', 'dre', 10, false, false),
('Deduções', 'grupo', 'dre', 20, false, false),
('Receita líquida', 'subtotal', 'dre', 30, true, false),
('Custos variáveis', 'grupo', 'dre', 40, false, false),
('Margem de contribuição', 'subtotal', 'dre', 50, false, true),
('Despesas fixas', 'grupo', 'dre', 60, false, false),
('Resultado operacional', 'subtotal', 'dre', 70, false, false),
('Resultado financeiro', 'grupo', 'dre', 80, false, false),
('Resultado líquido', 'subtotal', 'dre', 90, false, true),
('Investimentos', 'grupo', 'caixa', 100, false, false),
('Empréstimos', 'grupo', 'caixa', 110, false, false),
('Sócios', 'grupo', 'caixa', 120, false, false),
('Transferências', 'grupo', 'transferencia', 130, false, false)
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
INSERT INTO "centros_custo" ("nome", "ordem") VALUES
('Produção', 10),
('Comercial', 20),
('Administrativo', 30)
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
-- Regra pode não decidir categoria (só nome ou centro); apagar a categoria
-- deixa a regra sem categoria em vez de sumir com ela.
ALTER TABLE "regras_categorizacao" DROP CONSTRAINT "regras_categorizacao_categoria_id_categorias_id_fk";
--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ALTER COLUMN "categoria_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ADD CONSTRAINT "regras_categorizacao_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ADD COLUMN "centro_custo_id" uuid;--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ADD CONSTRAINT "regras_categorizacao_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "linha_id" uuid;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "centro_custo_id" uuid;--> statement-breakpoint
UPDATE "categorias" c SET "linha_id" = l."id"
FROM "linhas_dre" l
WHERE l."nome" = CASE c."grupo"::text
  WHEN 'receita' THEN 'Receita bruta'
  WHEN 'deducao' THEN 'Deduções'
  WHEN 'custo_variavel' THEN 'Custos variáveis'
  WHEN 'despesa_fixa' THEN 'Despesas fixas'
  WHEN 'financeiro' THEN 'Resultado financeiro'
  WHEN 'investimento' THEN 'Investimentos'
  WHEN 'financiamento' THEN 'Empréstimos'
  WHEN 'socios' THEN 'Sócios'
  WHEN 'transferencia' THEN 'Transferências'
END;
--> statement-breakpoint
UPDATE "categorias" c SET "centro_custo_id" = cc."id"
FROM "centros_custo" cc
WHERE cc."nome" = CASE
  WHEN c."nome" IN ('Insumos e matéria-prima', 'Embalagens', 'Salários e encargos', 'Aluguel', 'Energia elétrica', 'Água', 'Gás', 'Manutenção e limpeza', 'Transporte e deslocamento') THEN 'Produção'
  WHEN c."nome" IN ('Taxas de pagamento (Mercado Pago, cartão)', 'Entregas e frete', 'Comissões de parceiros', 'Marketing e anúncios') THEN 'Comercial'
  WHEN c."nome" IN ('Contabilidade', 'Sistemas e assinaturas', 'Tarifas bancárias', 'Internet e telefone', 'Pró-labore', 'Reembolsos a sócios', 'Outros tributos e taxas', 'Outras despesas') THEN 'Administrativo'
END;
--> statement-breakpoint
ALTER TABLE "categorias" ALTER COLUMN "linha_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_linha_id_linhas_dre_id_fk" FOREIGN KEY ("linha_id") REFERENCES "public"."linhas_dre"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Preenchidas por aplicarRegras (o build roda logo depois das migrations).
ALTER TABLE "movimentacoes_bancarias" ADD COLUMN "nome_exibicao" text;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD COLUMN "centro_custo_id" uuid;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentacao_centro_idx" ON "movimentacoes_bancarias" USING btree ("centro_custo_id");--> statement-breakpoint
ALTER TABLE "categorias" DROP COLUMN "grupo";--> statement-breakpoint
DROP TYPE "public"."grupo_dre";
