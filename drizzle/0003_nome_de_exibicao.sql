ALTER TABLE "movimentacoes_bancarias" ADD COLUMN "regra_id" uuid;--> statement-breakpoint
ALTER TABLE "regras_categorizacao" ADD COLUMN "nome_exibicao" text;--> statement-breakpoint
ALTER TABLE "movimentacoes_bancarias" ADD CONSTRAINT "movimentacoes_bancarias_regra_id_regras_categorizacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_categorizacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentacao_regra_idx" ON "movimentacoes_bancarias" USING btree ("regra_id");