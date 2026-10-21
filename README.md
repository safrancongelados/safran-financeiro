# Safran · Financeiro

DRE e fluxo de caixa da Safran Alimentos LTDA, montados a partir do extrato da
conta bancária da empresa, puxado da [Pluggy](https://pluggy.ai) via Open
Finance. Sistema separado do sistema de gestão (pedidos, fichas técnicas) e em
contas próprias da Safran (GitHub, Vercel, Supabase, Pluggy).

## Como funciona

1. **Início** (`/`) — o resumo do mês em andamento: saldo em conta, receita e
   resultado comparados com o mês anterior **até o mesmo dia**, pendências
   (sem categoria, conexão a reconectar, extrato parado), gráfico de receita
   e resultado dos últimos 12 meses, as maiores despesas do mês e os últimos
   lançamentos.
2. **Extrato** (`/extrato`) — as movimentações do mês, com busca (nome,
   descrição, contraparte ou CPF/CNPJ, sem acento; atalho `/`), filtros
   (entradas/saídas, categoria, centro de custo, conta), ordenação por data,
   nome ou valor e duas visões: *Lançamentos* (uma linha por movimentação) e
   *Por nome* (uma linha por grupo de iguais, com quantidade e total — o
   jeito rápido de categorizar em massa). Tudo fica na URL. Os cartões do
   topo são sempre do mês inteiro; o resumo da seleção fica junto dos filtros.
3. **Categorização** — cada linha tem nome (clique para editar; o padrão é
   a descrição do banco), categoria e centro de custo. Editar qualquer um
   deles vale para todas as linhas **iguais** — mesmo CPF/CNPJ, senão mesma
   contraparte, senão mesma descrição, no mesmo sentido —, passadas e
   futuras: a edição vira uma regra. *Só nesta* faz a exceção (escolha
   manual, que regra nenhuma muda).
4. **Configurações** (`/configuracoes`) — a estrutura da DRE é editável:
   linhas (grupos que somam categorias e subtotais que somam tudo acima),
   categorias de cada linha com o centro de custo padrão, centros de custo,
   as regras (categoria, nome de exibição e centro de cada uma) e a
   **conexão bancária**: a conta é conectada pelo widget da Pluggy
   (*Conectar banco*) e sincronizada todo dia às 07:00 (Maceió), a cada
   aviso do banco (webhook) ou pelo botão *Sincronizar agora*.
5. **DRE** (`/dre`) — regime de caixa, mês a mês, na estrutura configurada.
   A atual: receita bruta (por linha de produto: marmitas e porções, dietas
   personalizadas, personal chef) − deduções (Simples, taxas de cartão/Pix)
   = receita líquida − custos variáveis = **margem de contribuição** −
   custos fixos de produção − despesas comerciais − despesas administrativas
   = **resultado antes dos sócios** − remuneração dos sócios = resultado
   operacional ± financeiro = **resultado líquido**. Os subtotais marcados
   como *indicador* (margem e resultado operacional) dão os custos fixos e o
   **ponto de equilíbrio** (fixos mensais ÷ margem %), que aparecem na DRE
   e como linha de referência no gráfico do Início. Período por ano civil ou
   últimos 12 meses, filtro por centro de custo, *Só totais* esconde as
   categorias e o mês corrente fica em destaque. Cada valor leva às
   movimentações dele.

   O extrato não sabe qual produto foi vendido: toda venda cai na categoria
   **Vendas** (a base do rateio) e a DRE a reparte, mês a mês, entre
   marmitas, porções, dietas personalizadas e personal chef pelo **mix de
   pedidos da loja** (Cardápio Web), gravado em `vendas_por_produto` e
   visível em Configurações › Loja. Regras do mix: item com "dieta" no nome
   é dieta, "personal chef" é personal chef, categoria de porções é porção,
   o resto é marmita; dietas e personal chef têm preço zero no item e o
   valor vai na taxa adicional do pedido. Mês sem mix fica inteiro em
   marmitas, com aviso. Por ora o mix entra colado como texto (ou por
   migration); a sincronização automática depende de uma chave da API do
   Cardápio Web.

   Outra limitação: o Mercado Pago e a Tuna liberam as vendas em cartão já
   líquidas da taxa, então a receita bruta fica um pouco abaixo da real e
   "Taxas de meios de pagamento" só registra o que vem cobrado à parte.
6. **Fluxo de caixa** (`/fluxo-de-caixa`) — saldo inicial, operação (o
   resultado da DRE), cada linha de fora da DRE e saldo final, no mesmo
   período da DRE. Os saldos são reconstruídos de trás para frente a partir
   do saldo de hoje.

Investimentos, empréstimos (entrada e parcelas), aportes/retiradas de sócios e
transferências entre contas próprias ficam **fora da DRE**: mexem no caixa,
mas não são resultado da operação. Só contas (não cartão de crédito) entram na
DRE e no fluxo — no cartão, o dinheiro sai quando a fatura é paga.

## Regras de dinheiro

- Todo valor é **inteiro em centavos**, com o sinal do caixa: positivo entrou,
  negativo saiu.
- Transações **pendentes** ficam de fora até serem efetivadas.
- Lançamento apagado pelo banco (webhook `transactions/deleted`) sai do
  extrato; conexão apagada fica marcada, com o histórico preservado.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

Ver `.env.local.example`: `DATABASE_URL` (**Transaction pooler** da
Supabase, porta 6543 — o Session pooler esgota o limite de 15 clientes com as
funções da Vercel),
`SESSION_SECRET`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `CRON_SECRET`,
`PLUGGY_WEBHOOK_SECRET` e, para o primeiro acesso, `USUARIO_INICIAL_EMAIL` /
`USUARIO_INICIAL_SENHA`.

A senha do banco vai dentro da `DATABASE_URL`: caractere especial precisa ser
codificado (`#` vira `%23`, `@` vira `%40`), senão a URL quebra.

## Deploy

O build (`npm run build`) aplica as migrations pendentes antes do
`next build` (`scripts/migrate.mjs`): tabelas e plano de contas inicial são
criados na primeira publicação. Com `USUARIO_INICIAL_EMAIL` e
`USUARIO_INICIAL_SENHA` na Vercel, o mesmo build cria o primeiro acesso (só se
o e-mail ainda não existir). Outros acessos:

```bash
npm run usuario:criar -- email@dominio.com "Nome"   # mostra a senha provisória
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Migrations + build de produção |
| `npm run db:generate` | Gera migration a partir de `src/db/schema.ts` |
| `npm run db:deploy` | Aplica migrations pendentes |
| `npm run usuario:criar -- <email> "<nome>"` | Cria acesso / redefine senha |
| `npm run pluggy:sync [-- <itemId>]` | Sincroniza o extrato fora do cron |

## Estrutura

- `src/lib/pluggy/` — cliente da API, regra de sinal (`movimentacoes.ts`) e sync
- `src/lib/regras.ts` — motor de categorização (puro)
- `src/lib/dre.ts` — DRE, rateio das vendas e saldos (puro); `src/lib/resumo.ts` — os números da tela inicial
- `src/lib/vendas-por-produto.ts` — leitura do mix colado e a regra de classificação dos itens da loja
- `src/lib/extrato-filtros.ts` — os filtros do extrato na URL; `src/lib/extrato.ts` — visão por nome
- `src/lib/categorizacao.ts` — aplica as regras no banco
- `src/app/api/cron/pluggy`, `src/app/api/webhooks/pluggy` — sync automático
