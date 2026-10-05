-- Plano de contas inicial da Safran. Editável na tela /plano-de-contas.
INSERT INTO "categorias" ("nome", "grupo", "ordem") VALUES
('Vendas (Pix e transferências)', 'receita', 10),
('Vendas (cartão e maquininha)', 'receita', 20),
('Outras receitas', 'receita', 30),
('Simples Nacional (DAS)', 'deducao', 40),
('Estornos e devoluções', 'deducao', 50),
('Insumos e matéria-prima', 'custo_variavel', 60),
('Embalagens', 'custo_variavel', 70),
('Taxas de pagamento (Mercado Pago, cartão)', 'custo_variavel', 80),
('Entregas e frete', 'custo_variavel', 90),
('Comissões de parceiros', 'custo_variavel', 100),
('Aluguel', 'despesa_fixa', 110),
('Energia elétrica', 'despesa_fixa', 120),
('Água', 'despesa_fixa', 130),
('Gás', 'despesa_fixa', 140),
('Internet e telefone', 'despesa_fixa', 150),
('Salários e encargos', 'despesa_fixa', 160),
('Pró-labore', 'despesa_fixa', 170),
('Contabilidade', 'despesa_fixa', 180),
('Sistemas e assinaturas', 'despesa_fixa', 190),
('Marketing e anúncios', 'despesa_fixa', 200),
('Manutenção e limpeza', 'despesa_fixa', 210),
('Tarifas bancárias', 'despesa_fixa', 220),
('Outras despesas', 'despesa_fixa', 230),
('Juros e encargos financeiros', 'financeiro', 240),
('Rendimentos de aplicações', 'financeiro', 250),
('Equipamentos e reformas', 'investimento', 260),
('Empréstimos recebidos', 'financiamento', 270),
('Parcelas de empréstimos', 'financiamento', 280),
('Aportes dos sócios', 'socios', 290),
('Retiradas e distribuição de lucros', 'socios', 300),
('Transferência entre contas próprias', 'transferencia', 310)
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
-- Dinheiro que vai ou volta do próprio CNPJ da Safran é transferência entre
-- contas, não receita nem despesa.
INSERT INTO "regras_categorizacao" ("categoria_id", "campo", "padrao", "sentido")
SELECT "id", 'documento', '31511591000195', 'ambos' FROM "categorias" WHERE "nome" = 'Transferência entre contas próprias'
ON CONFLICT DO NOTHING;
