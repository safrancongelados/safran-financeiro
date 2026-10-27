-- ── Estornos e pagamentos cancelados ────────────────────────────────────────
--
-- Um pagamento que falhou vira dois lançamentos efetivados: a saída e a volta
-- do dinheiro. Até aqui a saída caía na despesa original e a volta em "Outras
-- receitas", inflando receita bruta e despesa pelo mesmo valor. A partir
-- desta migration o sync pareia a volta com a ida e lhe dá a mesma categoria
-- (lib/estornos.ts). O que fica aqui é a rede de segurança: estorno sem ida
-- encontrada cai numa categoria fora da DRE e fora das entradas e saídas,
-- em vez de virar receita.
INSERT INTO "linhas_dre" ("nome", "tipo", "secao", "ordem", "base_percentual", "mostrar_percentual")
VALUES ('Estornos e cancelamentos', 'grupo', 'transferencia', 180, false, false)
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
INSERT INTO "categorias" ("nome", "linha_id", "ordem")
SELECT 'Estornos e pagamentos cancelados', l."id", 10
FROM "linhas_dre" l WHERE l."nome" = 'Estornos e cancelamentos'
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
-- A regra antiga mandava todo reembolso para "Outras receitas".
UPDATE "regras_categorizacao" r SET "categoria_id" = c."id"
FROM "categorias" c
WHERE c."nome" = 'Estornos e pagamentos cancelados'
  AND r."campo" = 'descricao' AND r."padrao" = 'reembolso de pagamento' AND r."sentido" = 'entrada'
  AND r."categoria_id" = (SELECT "id" FROM "categorias" WHERE "nome" = 'Outras receitas');--> statement-breakpoint
-- Padrões já normalizados (sem acento, minúsculo). Precedência em lib/regras.ts:
-- sentido único ganha de "ambos" e trecho mais longo ganha do mais curto, por
-- isso "pagamento com codigo qr pix - cancelado" é mais longo que a regra de
-- vendas "pagamento com codigo qr", e "liberacao de dinheiro cancelada" é
-- saída, enquanto a de vendas "liberacao de dinheiro" é entrada.
INSERT INTO "regras_categorizacao" ("categoria_id", "campo", "padrao", "sentido")
SELECT c."id", v."campo"::"campo_regra", v."padrao", v."sentido"::"sentido_regra"
FROM (VALUES
  ('descricao', 'reembolso de transferencia', 'entrada'),
  ('descricao', 'pagamento cancelado', 'entrada'),
  ('descricao', 'pagamento com codigo qr pix - cancelado', 'entrada'),
  ('descricao', 'liberacao de dinheiro cancelada', 'saida')
) AS v("campo", "padrao", "sentido")
JOIN "categorias" c ON c."nome" = 'Estornos e pagamentos cancelados'
ON CONFLICT ("campo", "padrao", "sentido") DO NOTHING;
