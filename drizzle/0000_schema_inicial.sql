CREATE TYPE "public"."campo_regra" AS ENUM('documento', 'contraparte', 'descricao');--> statement-breakpoint
CREATE TYPE "public"."grupo_dre" AS ENUM('receita', 'deducao', 'custo_variavel', 'despesa_fixa', 'financeiro', 'investimento', 'financiamento', 'socios', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."origem_categoria" AS ENUM('regra', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sentido_regra" AS ENUM('entrada', 'saida', 'ambos');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"grupo" "grupo_dre" NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "conexoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text DEFAULT 'pluggy' NOT NULL,
	"provider_item_id" text NOT NULL,
	"instituicao" text,
	"status" text,
	"dados_atualizados_em" timestamp with time zone,
	"ultimo_sync_em" timestamp with time zone,
	"ultimo_sync_ok" boolean,
	"ultimo_sync_detalhe" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conexoes_bancarias_provider_item_id_unique" UNIQUE("provider_item_id")
);
--> statement-breakpoint
CREATE TABLE "contas_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conexao_id" uuid NOT NULL,
	"provider_account_id" text NOT NULL,
	"nome" text NOT NULL,
	"numero" text,
	"tipo" text NOT NULL,
	"subtipo" text,
	"saldo_centavos" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_bancarias_provider_account_id_unique" UNIQUE("provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"tipo" text,
	"meio" text,
	"contraparte" text,
	"contraparte_documento" text,
	"categoria_pluggy" text,
	"categoria_id" uuid,
	"categorizada_por" "origem_categoria",
	"payload_bruto" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacoes_bancarias_provider_transaction_id_unique" UNIQUE("provider_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "regras_categorizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"campo" "campo_regra" NOT NULL,
	"padrao" text NOT NULL,
	"sentido" "sentido_regra" DEFAULT 'ambos' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regra_campo_padrao_sentido_unq" UNIQUE("campo","padrao","sentido")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_conexao_id_conexoes_bancarias_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_bancarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_conta_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ADD CONSTRAINT "regras_categorizacao_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conta_bancaria_conexao_idx" ON "contas_bancarias" USING btree ("conexao_id");--> statement-breakpoint
CREATE INDEX "movimentacao_conta_data_idx" ON "movimentacoes_bancarias" USING btree ("conta_id","data");--> statement-breakpoint
CREATE INDEX "movimentacao_data_idx" ON "movimentacoes_bancarias" USING btree ("data");--> statement-breakpoint
CREATE INDEX "movimentacao_categoria_idx" ON "movimentacoes_bancarias" USING btree ("categoria_id");