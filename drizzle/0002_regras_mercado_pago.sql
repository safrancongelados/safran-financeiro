-- Regras de categorização desenhadas sobre o primeiro ano de extrato do
-- Mercado Pago (out/2025–out/2026). Os padrões já vão normalizados como
-- normalizarTexto faz (sem acento, minúsculo). Precedência em lib/regras.ts:
-- documento > contraparte > descrição; sentido único > ambos; padrão mais
-- longo primeiro. Por isso as regras genéricas de descrição são curtas
-- ("pix recebid"): nome de sócio, mais longo, ganha delas.
INSERT INTO "categorias" ("nome", "grupo", "ordem") VALUES
('Vendas (loja virtual)', 'receita', 15),
('Reembolsos a sócios', 'despesa_fixa', 175),
('Transporte e deslocamento', 'despesa_fixa', 215),
('Outros tributos e taxas', 'despesa_fixa', 225)
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
INSERT INTO "regras_categorizacao" ("categoria_id", "campo", "padrao", "sentido")
SELECT c."id", r."campo"::"campo_regra", r."padrao", r."sentido"::"sentido_regra"
FROM (VALUES
  -- Receita
  ('Vendas (cartão e maquininha)', 'descricao', 'liberacao de dinheiro', 'entrada'),
  ('Vendas (loja virtual)', 'contraparte', 'tuna pagamentos', 'entrada'),
  ('Vendas (loja virtual)', 'descricao', 'tuna pagamentos', 'entrada'),
  ('Vendas (Pix e transferências)', 'descricao', 'pix recebid', 'entrada'),
  ('Vendas (Pix e transferências)', 'descricao', 'pagamento com codigo qr', 'entrada'),
  ('Outras receitas', 'descricao', 'reembolso de pagamento', 'entrada'),

  -- Tributos
  ('Simples Nacional (DAS)', 'descricao', 'simples nacional', 'saida'),
  ('Outros tributos e taxas', 'descricao', 'tributos estaduais', 'saida'),
  ('Outros tributos e taxas', 'descricao', 'darf', 'saida'),

  -- Insumos
  ('Insumos e matéria-prima', 'documento', '06057223000171', 'saida'), -- Sendas (Assaí)
  ('Insumos e matéria-prima', 'documento', '46185347000157', 'saida'), -- Supermercado Ponto Certo
  ('Insumos e matéria-prima', 'documento', '39346861000161', 'saida'), -- Cencosud (GBarbosa)
  ('Insumos e matéria-prima', 'documento', '30903362000153', 'saida'), -- Jota Pinto e Casado
  ('Insumos e matéria-prima', 'documento', '20300157000140', 'saida'), -- Novo Atacado
  ('Insumos e matéria-prima', 'documento', '59008895000153', 'saida'), -- Mateus Supermercados
  ('Insumos e matéria-prima', 'documento', '36734492000196', 'saida'), -- THF produtos naturais
  ('Insumos e matéria-prima', 'documento', '34629791000216', 'saida'), -- Almeida Bandeira produtos naturais
  ('Insumos e matéria-prima', 'documento', '24322398001201', 'saida'), -- Especiarya
  ('Insumos e matéria-prima', 'descricao', 'assai atacadista', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'g barbosa', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'gbarbosa', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'ponto certo', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'novo atacarejo', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'mateus supermerca', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'mix mateus', 'saida'),
  ('Insumos e matéria-prima', 'descricao', 'manjericao produtos', 'saida'),

  -- Embalagens
  ('Embalagens', 'documento', '29196541000119', 'saida'), -- I9 Embalagens
  ('Embalagens', 'documento', '01888146000420', 'saida'), -- Comercial de Embalagens Descartáveis e Festas
  ('Embalagens', 'documento', '09358384000193', 'saida'), -- Aleplast
  ('Embalagens', 'descricao', 'plastfest', 'saida'),
  ('Embalagens', 'descricao', 'plast fest', 'saida'),
  ('Embalagens', 'descricao', 'aleplast', 'saida'),

  -- Entregas (Uber Flash / 99)
  ('Entregas e frete', 'documento', '17895646000187', 'saida'), -- Uber
  ('Entregas e frete', 'descricao', 'uber', 'saida'),
  ('Entregas e frete', 'contraparte', '99 tecnologia', 'saida'),

  -- Transporte da equipe: Pix por QR de R$ 5–15 (mototáxi, van) e as vans
  -- com CNPJ. Pagamento por QR a fornecedor conhecido cai antes na regra do
  -- CNPJ dele.
  ('Transporte e deslocamento', 'descricao', 'pagamento com qr', 'saida'),
  ('Transporte e deslocamento', 'documento', '26579724000125', 'saida'), -- Fabio L S da Silva Transporte
  ('Transporte e deslocamento', 'documento', '23017261000110', 'saida'), -- José Aparecido Terto da Silva Transportes
  ('Transporte e deslocamento', 'documento', '18949364000188', 'saida'), -- JP Transportes e Turismo
  ('Transporte e deslocamento', 'documento', '34238304000103', 'saida'), -- J P D C Transportes e Turismo
  ('Transporte e deslocamento', 'documento', '19685046000110', 'saida'), -- A dos Santos Diniz Transportes
  ('Transporte e deslocamento', 'documento', '19469057000162', 'saida'), -- Teixeira & Silva Transportes

  -- Despesas fixas
  ('Aluguel', 'descricao', 'batista delfino', 'saida'),
  ('Energia elétrica', 'documento', '12272084000100', 'saida'), -- Equatorial
  ('Água', 'documento', '39580673000101', 'saida'), -- BRK Ambiental
  ('Água', 'descricao', 'brk ambiental', 'saida'),
  ('Internet e telefone', 'documento', '02421421000111', 'saida'), -- TIM
  ('Contabilidade', 'documento', '35370345000111', 'saida'), -- S. L. Contábil
  ('Sistemas e assinaturas', 'documento', '40834981000197', 'saida'), -- Cardápio Web
  ('Sistemas e assinaturas', 'documento', '11914993000123', 'saida'), -- Saurus Software
  ('Marketing e anúncios', 'documento', '27415911000136', 'saida'), -- ByteDance (TikTok)
  ('Manutenção e limpeza', 'documento', '19854965000170', 'saida'), -- Felix materiais de construção

  -- Equipe
  ('Salários e encargos', 'descricao', 'danyelle cristine', 'saida'),
  ('Salários e encargos', 'descricao', 'alexandre jose', 'saida'),
  ('Salários e encargos', 'descricao', 'jainne conceicao', 'saida'),
  ('Salários e encargos', 'descricao', 'ines djanira', 'saida'),
  ('Salários e encargos', 'descricao', 'adeilza dos santos', 'saida'),
  ('Salários e encargos', 'descricao', 'marluce da conceicao', 'saida'),
  ('Salários e encargos', 'descricao', 'wyvinnes', 'saida'),
  ('Salários e encargos', 'descricao', 'edinan erick', 'saida'),
  ('Salários e encargos', 'descricao', 'luciana gedalva', 'saida'),

  -- Sócios
  ('Pró-labore', 'descricao', 'isabel cristina', 'saida'),
  ('Pró-labore', 'descricao', 'glaucos antonio', 'saida'),
  ('Reembolsos a sócios', 'descricao', 'victor antonio', 'saida'),
  ('Aportes dos sócios', 'descricao', 'isabel cristina pereira', 'entrada'),
  ('Aportes dos sócios', 'descricao', 'glaucos antonio', 'entrada'),
  ('Aportes dos sócios', 'descricao', 'victor antonio cavalcante', 'entrada'),

  -- Empréstimo Desenvolve
  ('Parcelas de empréstimos', 'documento', '10769660000195', 'saida'), -- Agência de Fomento de Alagoas

  -- Dinheiro que só muda de lugar: reserva "Desenvolve" do Mercado Pago e
  -- transferência que o banco cancelou e devolveu.
  ('Transferência entre contas próprias', 'descricao', 'dinheiro reservado', 'ambos'),
  ('Transferência entre contas próprias', 'descricao', 'dinheiro retirado', 'ambos'),
  ('Transferência entre contas próprias', 'descricao', 'transferencia cancelada', 'entrada'),
  ('Transferência entre contas próprias', 'descricao', 'transferencia enviada jose adeilton', 'saida')
) AS r("categoria", "campo", "padrao", "sentido")
JOIN "categorias" c ON c."nome" = r."categoria"
ON CONFLICT DO NOTHING;
