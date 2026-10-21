CREATE TYPE "public"."linha_produto" AS ENUM('marmitas', 'porcoes', 'dietas', 'personal_chef');--> statement-breakpoint
CREATE TABLE "vendas_por_produto" (
	"mes" text NOT NULL,
	"linha" "linha_produto" NOT NULL,
	"valor_centavos" integer DEFAULT 0 NOT NULL,
	"pedidos" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_por_produto_mes_linha_pk" PRIMARY KEY("mes","linha")
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "rateada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "linha_produto" "linha_produto";--> statement-breakpoint
-- ── Rateio das vendas pelo mix da loja ──────────────────────────────────────
--
-- O extrato não sabe o que foi vendido. A categoria de vendas do extrato vira
-- "Vendas" (a base do rateio) e a DRE a reparte, mês a mês, entre marmitas,
-- porções, dietas e personal chef pelo mix de pedidos do Cardápio Web
-- (tabela vendas_por_produto). As categorias de produto ficam inativas: não
-- aparecem nos seletores do extrato, só recebem o rateio.
UPDATE "categorias" SET "nome" = 'Vendas', "rateada" = true, "ordem" = 5 WHERE "nome" = 'Vendas de marmitas e porções';--> statement-breakpoint
UPDATE "categorias" SET "rateada" = true WHERE "nome" = 'Vendas' AND NOT EXISTS (SELECT 1 FROM "categorias" WHERE "rateada");--> statement-breakpoint
INSERT INTO "categorias" ("nome", "linha_id", "ordem", "ativa", "linha_produto")
SELECT v."nome", l."id", v."ordem", false, v."linha"::"linha_produto"
FROM (VALUES
  ('Vendas de marmitas', 10, 'marmitas'),
  ('Vendas de porções', 15, 'porcoes')
) AS v("nome", "ordem", "linha")
JOIN "linhas_dre" l ON l."nome" = 'Receita bruta'
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
UPDATE "categorias" SET "linha_produto" = 'dietas', "ativa" = false WHERE "nome" = 'Vendas de dietas personalizadas' AND "linha_produto" IS NULL;--> statement-breakpoint
UPDATE "categorias" SET "linha_produto" = 'personal_chef', "ativa" = false WHERE "nome" = 'Vendas de personal chef' AND "linha_produto" IS NULL;--> statement-breakpoint
-- Mix de nov/2025 a out/2026 lido do Cardápio Web em 21/10/2026 (pedidos criados no mês,
-- sem cancelados; dietas e personal chef pela taxa adicional dos pedidos do painel com
-- total maior que zero; outubro até o dia 21). Mês e produto já gravados são mantidos.
INSERT INTO "vendas_por_produto" ("mes", "linha", "valor_centavos", "pedidos") VALUES
('2025-11', 'marmitas', 1784380, 85),
('2025-11', 'porcoes', 134940, 0),
('2025-11', 'dietas', 52912, 3),
('2025-11', 'personal_chef', 0, 0),
('2025-12', 'marmitas', 1128690, 69),
('2025-12', 'porcoes', 146500, 0),
('2025-12', 'dietas', 54148, 3),
('2025-12', 'personal_chef', 0, 0),
('2026-01', 'marmitas', 1734770, 86),
('2026-01', 'porcoes', 111480, 0),
('2026-01', 'dietas', 74745, 3),
('2026-01', 'personal_chef', 110064, 3),
('2026-02', 'marmitas', 2705040, 116),
('2026-02', 'porcoes', 61700, 0),
('2026-02', 'dietas', 65527, 2),
('2026-02', 'personal_chef', 31740, 1),
('2026-03', 'marmitas', 3022640, 127),
('2026-03', 'porcoes', 155600, 0),
('2026-03', 'dietas', 63452, 3),
('2026-03', 'personal_chef', 101475, 3),
('2026-04', 'marmitas', 2771810, 108),
('2026-04', 'porcoes', 85000, 0),
('2026-04', 'dietas', 64140, 5),
('2026-04', 'personal_chef', 62650, 2),
('2026-05', 'marmitas', 3395050, 128),
('2026-05', 'porcoes', 130200, 0),
('2026-05', 'dietas', 0, 2),
('2026-05', 'personal_chef', 106320, 2),
('2026-06', 'marmitas', 2789770, 108),
('2026-06', 'porcoes', 136950, 0),
('2026-06', 'dietas', 221357, 6),
('2026-06', 'personal_chef', 45000, 1),
('2026-07', 'marmitas', 3051498, 114),
('2026-07', 'porcoes', 101500, 0),
('2026-07', 'dietas', 254622, 7),
('2026-07', 'personal_chef', 0, 0),
('2026-08', 'marmitas', 2948650, 109),
('2026-08', 'porcoes', 124200, 0),
('2026-08', 'dietas', 189421, 8),
('2026-08', 'personal_chef', 0, 0),
('2026-09', 'marmitas', 2970480, 107),
('2026-09', 'porcoes', 74800, 0),
('2026-09', 'dietas', 301936, 10),
('2026-09', 'personal_chef', 0, 0),
('2026-10', 'marmitas', 2347110, 65),
('2026-10', 'porcoes', 81800, 0),
('2026-10', 'dietas', 56580, 2),
('2026-10', 'personal_chef', 0, 0)
ON CONFLICT ("mes", "linha") DO NOTHING;
