CREATE TYPE "public"."papel_linha_dre" AS ENUM('margem', 'operacional');--> statement-breakpoint
ALTER TABLE "linhas_dre" ADD COLUMN "papel" "papel_linha_dre";--> statement-breakpoint
-- ── A DRE por linha de produto (decisão de 21/10/2026) ───────────────────
--
-- Receita por produto (marmitas e porções, dietas, personal chef) em vez de
-- por canal; taxas de cartão/Pix em deduções; despesas fixas em três linhas
-- (produção, comercial, administrativo); remuneração dos sócios com o
-- subtotal "Resultado antes dos sócios"; tarifas bancárias no financeiro.
-- Tudo por nome, com guardas: o que já tiver sido mudado na tela fica.

-- 1. Linhas: renomeia a de despesas fixas e cria as quatro novas logo
--    depois dela (o renumerar no fim arruma o passo de 10).
UPDATE "linhas_dre" SET "nome" = 'Custos fixos de produção' WHERE "nome" = 'Despesas fixas';--> statement-breakpoint
INSERT INTO "linhas_dre" ("nome", "tipo", "secao", "ordem", "base_percentual", "mostrar_percentual")
SELECT v."nome", v."tipo"::"tipo_linha_dre", 'dre'::"secao_dre",
       COALESCE((SELECT "ordem" FROM "linhas_dre" WHERE "nome" = 'Custos fixos de produção'), 60) + v."passo",
       false, v."mostrar"
FROM (VALUES
  ('Despesas comerciais', 'grupo', 2, false),
  ('Despesas administrativas', 'grupo', 4, false),
  ('Resultado antes dos sócios', 'subtotal', 6, true),
  ('Remuneração dos sócios', 'grupo', 8, false)
) AS v("nome", "tipo", "passo", "mostrar")
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
-- Os subtotais que alimentam custos fixos e ponto de equilíbrio.
UPDATE "linhas_dre" SET "papel" = 'margem' WHERE "nome" = 'Margem de contribuição' AND "tipo" = 'subtotal'
  AND NOT EXISTS (SELECT 1 FROM "linhas_dre" WHERE "papel" = 'margem');--> statement-breakpoint
UPDATE "linhas_dre" SET "papel" = 'operacional' WHERE "nome" = 'Resultado operacional' AND "tipo" = 'subtotal'
  AND NOT EXISTS (SELECT 1 FROM "linhas_dre" WHERE "papel" = 'operacional');--> statement-breakpoint

-- 2. Receita por linha de produto. A loja virtual vende marmitas e porções;
--    as vendas por Pix e por cartão também, por padrão — dieta e personal
--    chef se marcam por cliente no extrato.
UPDATE "categorias" SET "nome" = 'Vendas de marmitas e porções', "ordem" = 10 WHERE "nome" = 'Vendas (loja virtual)';--> statement-breakpoint
INSERT INTO "categorias" ("nome", "linha_id", "ordem")
SELECT v."nome", l."id", v."ordem"
FROM (VALUES
  ('Vendas de marmitas e porções', 10),
  ('Vendas de dietas personalizadas', 20),
  ('Vendas de personal chef', 30)
) AS v("nome", "ordem")
JOIN "linhas_dre" l ON l."nome" = 'Receita bruta'
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
UPDATE "categorias" SET "ordem" = 40 WHERE "nome" = 'Outras receitas';--> statement-breakpoint
UPDATE "movimentacoes_bancarias" m SET "categoria_id" = alvo."id", "updated_at" = now()
FROM "categorias" alvo, "categorias" velha
WHERE alvo."nome" = 'Vendas de marmitas e porções'
  AND velha."nome" IN ('Vendas (Pix e transferências)', 'Vendas (cartão e maquininha)')
  AND m."categoria_id" = velha."id";--> statement-breakpoint
UPDATE "regras_categorizacao" r SET "categoria_id" = alvo."id"
FROM "categorias" alvo, "categorias" velha
WHERE alvo."nome" = 'Vendas de marmitas e porções'
  AND velha."nome" IN ('Vendas (Pix e transferências)', 'Vendas (cartão e maquininha)')
  AND r."categoria_id" = velha."id";--> statement-breakpoint
DELETE FROM "categorias" WHERE "nome" IN ('Vendas (Pix e transferências)', 'Vendas (cartão e maquininha)')
  AND NOT EXISTS (SELECT 1 FROM "movimentacoes_bancarias" m WHERE m."categoria_id" = "categorias"."id");--> statement-breakpoint

-- 3. Taxas de meios de pagamento são dedução da receita, sem centro de custo.
UPDATE "categorias" SET "nome" = 'Taxas de meios de pagamento' WHERE "nome" = 'Taxas de pagamento (Mercado Pago, cartão)';--> statement-breakpoint
UPDATE "categorias" c SET "linha_id" = l."id", "centro_custo_id" = NULL, "ordem" = 45
FROM "linhas_dre" l WHERE l."nome" = 'Deduções' AND c."nome" = 'Taxas de meios de pagamento';--> statement-breakpoint
UPDATE "categorias" SET "nome" = 'Embalagens e descartáveis' WHERE "nome" = 'Embalagens';--> statement-breakpoint

-- 4. Fixos em três linhas; sócios com linha própria; tarifas no financeiro.
UPDATE "categorias" c SET "linha_id" = l."id"
FROM "linhas_dre" l WHERE l."nome" = 'Despesas comerciais' AND c."nome" IN ('Marketing e anúncios');--> statement-breakpoint
UPDATE "categorias" c SET "linha_id" = l."id"
FROM "linhas_dre" l WHERE l."nome" = 'Despesas administrativas'
  AND c."nome" IN ('Contabilidade', 'Sistemas e assinaturas', 'Internet e telefone', 'Outros tributos e taxas', 'Outras despesas');--> statement-breakpoint
UPDATE "categorias" c SET "linha_id" = l."id"
FROM "linhas_dre" l WHERE l."nome" = 'Remuneração dos sócios' AND c."nome" IN ('Pró-labore', 'Reembolsos a sócios');--> statement-breakpoint
UPDATE "categorias" c SET "linha_id" = l."id", "centro_custo_id" = NULL
FROM "linhas_dre" l WHERE l."nome" = 'Resultado financeiro' AND c."nome" = 'Tarifas bancárias';--> statement-breakpoint
INSERT INTO "categorias" ("nome", "linha_id", "centro_custo_id", "ordem")
SELECT v."nome", l."id", cc."id", v."ordem"
FROM (VALUES
  ('Utensílios e pequenos equipamentos', 'Custos fixos de produção', 'Produção', 235),
  ('Plataformas de venda (loja, cardápio)', 'Despesas comerciais', 'Comercial', 205)
) AS v("nome", "linha", "centro", "ordem")
JOIN "linhas_dre" l ON l."nome" = v."linha"
LEFT JOIN "centros_custo" cc ON cc."nome" = v."centro"
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint

-- 5. Renumera as linhas de 10 em 10, na ordem em que ficaram.
UPDATE "linhas_dre" l SET "ordem" = n."pos" * 10
FROM (SELECT "id", row_number() OVER (ORDER BY "ordem", "nome") AS "pos" FROM "linhas_dre") n
WHERE n."id" = l."id";
