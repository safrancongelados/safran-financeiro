CREATE TYPE "public"."papel_usuario" AS ENUM('dono', 'financeiro', 'leitura');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta" AS ENUM('saldo_minimo', 'despesa_acima_media', 'lancamento_grande_sem_categoria', 'pessoa_acima_meta', 'fornecedor_novo', 'sync_parado', 'imposto_previsto');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('funcionario', 'socio', 'fornecedor', 'cliente', 'outro');--> statement-breakpoint
ALTER TYPE "public"."origem_categoria" ADD VALUE 'pessoa';--> statement-breakpoint
ALTER TYPE "public"."origem_categoria" ADD VALUE 'estorno';--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_alerta" NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertas_tipo_unique" UNIQUE("tipo")
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"usuario_nome" text NOT NULL,
	"acao" text NOT NULL,
	"alvo_tipo" text NOT NULL,
	"alvo_id" text,
	"detalhe" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_pessoa" DEFAULT 'outro' NOT NULL,
	"documento" text,
	"padroes" text[] DEFAULT '{}' NOT NULL,
	"categoria_id" uuid,
	"meta_mensal_centavos" integer,
	"ativa" boolean DEFAULT true NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoas_documento_unique" UNIQUE("documento")
);
--> statement-breakpoint
CREATE TABLE "visoes_salvas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"params" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD COLUMN "pessoa_id" uuid;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "papel" "papel_usuario" DEFAULT 'dono' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_data_idx" ON "auditoria" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auditoria_alvo_idx" ON "auditoria" USING btree ("alvo_tipo","alvo_id");--> statement-breakpoint
CREATE INDEX "pessoa_tipo_idx" ON "pessoas" USING btree ("tipo");--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentacao_pessoa_idx" ON "movimentacoes_bancarias" USING btree ("pessoa_id");--> statement-breakpoint
-- ── Dados iniciais ──────────────────────────────────────────────────────────
--
-- Alertas com os limites que fazem sentido para o caixa da Safran hoje; tudo
-- editável em /alertas. Valores em centavos.
INSERT INTO "alertas" ("tipo", "parametros", "ativo") VALUES
('saldo_minimo', '{"valorCentavos": 500000}', true),
('despesa_acima_media', '{"percentual": 30, "minimoCentavos": 50000}', true),
('lancamento_grande_sem_categoria', '{"valorCentavos": 100000}', true),
('pessoa_acima_meta', '{}', true),
('fornecedor_novo', '{"valorCentavos": 100000, "dias": 30}', true),
('sync_parado', '{"dias": 3}', true),
('imposto_previsto', '{"toleranciaDias": 3}', true)
ON CONFLICT ("tipo") DO NOTHING;--> statement-breakpoint
-- Os sócios já estavam nas regras de categorização por descrição; viram
-- cadastro para o relatório de pessoal e os alertas de meta.
INSERT INTO "pessoas" ("nome", "tipo", "padroes", "categoria_id")
SELECT v."nome", 'socio'::"tipo_pessoa", v."padroes"::text[], (SELECT "id" FROM "categorias" WHERE "nome" = v."categoria")
FROM (VALUES
  ('Isabel Cristina Pereira Cavalcante', '{"isabel cristina pereira cavalcante"}', 'Pró-labore'),
  ('Glaucos Antonio Cavalcante Costa', '{"glaucos antonio cavalcante costa"}', 'Pró-labore'),
  ('Victor Antonio Cavalcante Costa', '{"victor antonio cavalcante costa","victor antonio c costa"}', 'Reembolsos a sócios')
) AS v("nome", "padroes", "categoria")
WHERE NOT EXISTS (SELECT 1 FROM "pessoas" p WHERE p."nome" = v."nome");
