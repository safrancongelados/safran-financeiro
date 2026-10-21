CREATE TABLE "integracao_cardapio_web" (
	"id" text PRIMARY KEY DEFAULT 'loja' NOT NULL,
	"merchant_uuid" text,
	"loja_nome" text,
	"coberto_desde" date,
	"ultimo_sync_em" timestamp with time zone,
	"ultimo_sync_ok" boolean,
	"ultimo_sync_detalhe" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_pedido_cardapio_web" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"item_pedido_id" bigint NOT NULL,
	"item_id" bigint,
	"codigo_externo" text,
	"nome" text NOT NULL,
	"categoria_cw" text,
	"quantidade" numeric(10, 3) DEFAULT 1 NOT NULL,
	"preco_unitario_centavos" integer DEFAULT 0 NOT NULL,
	"total_centavos" integer NOT NULL,
	CONSTRAINT "itens_pedido_cardapio_web_item_pedido_id_unique" UNIQUE("item_pedido_id")
);
--> statement-breakpoint
CREATE TABLE "mapeamento_cardapio_web" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_cw" text NOT NULL,
	"categoria_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mapeamento_cardapio_web_categoria_cw_unique" UNIQUE("categoria_cw")
);
--> statement-breakpoint
CREATE TABLE "pedidos_cardapio_web" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" bigint NOT NULL,
	"display_id" integer,
	"status" text NOT NULL,
	"tipo" text,
	"canal" text,
	"origem_cliente" text,
	"criado_em" timestamp with time zone NOT NULL,
	"data" date NOT NULL,
	"agendado_para" date,
	"atualizado_em" timestamp with time zone,
	"meio_pagamento" text,
	"total_centavos" integer NOT NULL,
	"itens_centavos" integer DEFAULT 0 NOT NULL,
	"taxa_entrega_centavos" integer DEFAULT 0 NOT NULL,
	"desconto_centavos" integer DEFAULT 0 NOT NULL,
	"cliente_nome" text,
	"payload_bruto" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_cardapio_web_pedido_id_unique" UNIQUE("pedido_id")
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "rateada_por_pedidos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itens_pedido_cardapio_web" ADD CONSTRAINT "itens_pedido_cardapio_web_pedido_id_pedidos_cardapio_web_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_cardapio_web"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeamento_cardapio_web" ADD CONSTRAINT "mapeamento_cardapio_web_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_pedido_cw_pedido_idx" ON "itens_pedido_cardapio_web" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "item_pedido_cw_categoria_idx" ON "itens_pedido_cardapio_web" USING btree ("categoria_cw");--> statement-breakpoint
CREATE INDEX "pedido_cw_data_idx" ON "pedidos_cardapio_web" USING btree ("data");--> statement-breakpoint
CREATE INDEX "pedido_cw_status_idx" ON "pedidos_cardapio_web" USING btree ("status");--> statement-breakpoint
-- ── Receita repartida pelos pedidos do Cardápio Web (decisão de 21/10/2026) ──
--
-- O extrato não sabe o que foi vendido: Tuna, maquininha e Pix caem todos em
-- "Vendas de marmitas e porções". Os pedidos sabem. Essa categoria passa a
-- ser rateada: o recebido do mês é repartido entre as linhas de produto na
-- proporção do que os pedidos venderam em cada uma (lib/rateio.ts).
UPDATE "categorias" SET "rateada_por_pedidos" = true WHERE "nome" = 'Vendas de marmitas e porções'
  AND NOT EXISTS (SELECT 1 FROM "categorias" WHERE "rateada_por_pedidos");--> statement-breakpoint
-- As categorias do cardápio da Safran, já apontadas para a linha de produto
-- em que vendem. Categoria nova que aparecer nos pedidos entra sem destino
-- (vai para a rateada padrão) até alguém escolher em Configurações.
INSERT INTO "mapeamento_cardapio_web" ("categoria_cw", "categoria_id")
SELECT v."categoria_cw", c."id"
FROM (VALUES
  ('Linha Performance', 'Vendas de marmitas e porções'),
  ('Linha Comfort', 'Vendas de marmitas e porções'),
  ('Linha Low Carb', 'Vendas de marmitas e porções'),
  ('Porções à vácuo', 'Vendas de marmitas e porções'),
  ('Pacotes', 'Vendas de marmitas e porções'),
  ('RESET ALIMENTAR', 'Vendas de dietas personalizadas')
) AS v("categoria_cw", "categoria")
LEFT JOIN "categorias" c ON c."nome" = v."categoria"
ON CONFLICT ("categoria_cw") DO NOTHING;
