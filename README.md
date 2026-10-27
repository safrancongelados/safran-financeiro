# Safran · Financeiro

DRE e fluxo de caixa da Safran Alimentos LTDA, montados a partir do extrato da
conta bancária da empresa, puxado da [Pluggy](https://pluggy.ai) via Open
Finance. Sistema separado do sistema de gestão (pedidos, fichas técnicas) e em
contas próprias da Safran (GitHub, Vercel, Supabase, Pluggy).

## Como funciona

1. **Início** (`/`) — o resumo do mês em andamento: saldo em conta, receita e
   resultado comparados com o mês anterior **até o mesmo dia**, pendências e
   alertas (sem categoria, conexão a reconectar, saldo abaixo do mínimo,
   imposto que não saiu...), o que está **previsto para os próximos 30
   dias** (pagamentos que se repetem todo mês), gráfico de receita e
   resultado dos últimos 12 meses, as maiores despesas do mês e os últimos
   lançamentos.
2. **Extrato** (`/extrato`) — as movimentações por período (um mês com
   setas, 3/6/12 meses, o ano ou um intervalo de datas), com busca (nome,
   descrição, contraparte ou CPF/CNPJ, sem acento; atalho `/`; `[` e `]`
   andam um mês), filtros (entradas/saídas, categoria, centro de custo,
   conta, pessoa, faixa de valor, origem da categoria), chips do que está
   ativo, visões salvas, ordenação e duas visões: *Lançamentos* e *Por
   nome* (uma linha por grupo de iguais). Tudo fica na URL. Seleção em lote
   para categorizar várias linhas ou vinculá-las a uma pessoa; anotação
   livre por lançamento; exportação em CSV do que está na tela. No celular
   vira lista de cartões.
3. **Categorização** — cada linha tem nome (clique para editar), categoria e
   centro de custo. Ao trocar a categoria, um diálogo pergunta o alcance:
   todas as linhas com o mesmo CPF/CNPJ, com a mesma contraparte, com a mesma
   descrição (cada opção com a contagem) ou **só esta**. As três primeiras
   viram regra e valem para o passado e o futuro; "só esta" é escolha manual
   que regra nenhuma muda. O selo ao lado da categoria diz de onde ela veio:
   *auto* (regra, com link), *pessoa* (categoria padrão da pessoa),
   *estorno* (herdada da ida) ou *só esta*.
4. **A revisar** (`/revisar`) — o que está sem categoria, agrupado por
   iguais, com a categoria sugerida pelo que já foi categorizado antes
   (mesmo CPF/CNPJ, mesma contraparte ou descrição parecida). Aprovar cria a
   regra; "Aprovar todas as sugestões" faz isso de uma vez.
5. **Pessoas** (`/pessoas`) — funcionários, sócios, fornecedores e clientes,
   reconhecidos pelo CPF/CNPJ ou por trechos do nome que o banco escreve.
   Cada lançamento ganha a pessoa (`movimentacoes.pessoa_id`) e, sem regra
   que decida, a categoria padrão dela. Meta mensal para o relatório de
   pessoal e o alerta de "acima da meta". No extrato, toda contraparte tem o
   atalho "+ pessoa", já preenchido.
6. **Relatórios** (`/relatorios`) — por período, com CSV: *Pessoal e
   sócios* (por pessoa e mês, contra a meta, mais o que caiu em categoria de
   pessoal sem cadastro), *Custos* (por categoria e mês, participação,
   variação do mês e tendência de 3 meses, maiores contrapartes de cada
   categoria), *Fornecedores* (ranking com total, média, último mês e
   tendência) e *Impostos* (por imposto e mês, com a alíquota efetiva sobre a
   receita bruta).
7. **Alertas** (`/alertas`) — limites configuráveis: saldo mínimo, categoria
   acima da média, lançamento grande sem categoria, pessoa acima da meta,
   fornecedor novo com valor alto, extrato parado e imposto do mês que ainda
   não saiu. Os disparados aparecem no Início, no menu e no resumo semanal.
8. **Busca global** — `Ctrl+K` (ou `⌘K`) encontra páginas, pessoas,
   categorias e contrapartes e leva direto ao lugar certo.
9. **Configurações** (`/configuracoes`) — a estrutura da DRE é editável:
   linhas (grupos que somam categorias e subtotais que somam tudo acima),
   categorias de cada linha com o centro de custo padrão, centros de custo,
   as regras (categoria, nome de exibição e centro de cada uma), a
   **conexão bancária** (widget da Pluggy, sincronizada todo dia às 07:00 de
   Maceió, a cada aviso do banco e pelo botão), o **histórico** de quem
   mudou o quê e os **acessos** (dono, financeiro e somente leitura; só o
   dono gerencia).
10. **DRE** (`/dre`) — regime de caixa, mês a mês, na estrutura configurada.
   A atual: receita bruta (por linha de produto: marmitas e porções, dietas
   personalizadas, personal chef) − deduções (Simples, taxas de cartão/Pix)
   = receita líquida − custos variáveis = **margem de contribuição** −
   custos fixos de produção − despesas comerciais − despesas administrativas
   = **resultado antes dos sócios** − remuneração dos sócios = resultado
   operacional ± financeiro = **resultado líquido**. Os subtotais marcados
   como *indicador* (margem e resultado operacional) dão os custos fixos e o
   **ponto de equilíbrio** (fixos mensais ÷ margem %), que aparecem na DRE
   e como linha de referência no gráfico do Início. Período de 3, 6 ou 12
   meses ou ano civil, filtro por centro de custo, *Só totais* esconde as
   categorias e o mês corrente fica em destaque. Cada valor leva às
   movimentações dele.

   O extrato não sabe qual produto foi vendido: toda venda cai na categoria
   **Vendas** (a base do rateio) e a DRE a reparte, mês a mês, entre
   marmitas, porções, dietas personalizadas e personal chef pelo **mix de
   pedidos da loja** (Cardápio Web), gravado em `vendas_por_produto` e
   visível em Configurações › Loja. Mês sem mix fica inteiro em marmitas,
   com aviso. O Mercado Pago e a Tuna liberam as vendas em cartão já
   líquidas da taxa, então a receita bruta fica um pouco abaixo da real.
11. **Fluxo de caixa** (`/fluxo-de-caixa`) — saldo inicial, operação (o
   resultado da DRE), cada linha de fora da DRE e saldo final, no mesmo
   período da DRE. Os saldos são reconstruídos de trás para frente a partir
   do saldo de hoje.

Investimentos, empréstimos (entrada e parcelas), aportes/retiradas de sócios e
transferências entre contas próprias ficam **fora da DRE**: mexem no caixa,
mas não são resultado da operação. Só contas (não cartão de crédito) entram na
DRE e no fluxo — no cartão, o dinheiro sai quando a fatura é paga.

## Acessos

Três papéis: **dono** (tudo, inclusive criar e remover acessos),
**financeiro** (categoriza, cadastra e configura) e **somente leitura** (o
contador: vê extrato, DRE e relatórios, não muda nada). Toda action de
escrita checa o papel (`src/lib/permissoes.ts`); toda mudança deixa registro
em Configurações › Histórico (`src/lib/auditoria.ts`).

## Regras de dinheiro

- Todo valor é **inteiro em centavos**, com o sinal do caixa: positivo entrou,
  negativo saiu.
- Transações **pendentes** ficam de fora até serem efetivadas.
- **Estornos** (reembolso, pagamento cancelado, transferência cancelada)
  ficam no extrato, porque mexeram no saldo, mas são pareados com a ida —
  mesmo valor com sinal trocado, na mesma conta, até 10 dias antes — e
  herdam a categoria dela, para os dois se anularem na mesma linha da DRE
  (`src/lib/estornos.ts`, selo *estorno* no extrato). Estorno sem ida
  encontrada cai em "Estornos e pagamentos cancelados", fora da DRE.
- Lançamento apagado pelo banco (webhook `transactions/deleted`) sai do
  extrato; conexão apagada fica marcada, com o histórico preservado.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

Ver `.env.local.example`: `DATABASE_URL` (**Transaction pooler** da
Supabase, porta 6543 — o Session pooler esgota o limite de 15 clientes com as
funções da Vercel),
`SESSION_SECRET`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `CRON_SECRET`,
`PLUGGY_WEBHOOK_SECRET` e, para o primeiro acesso, `USUARIO_INICIAL_EMAIL` /
`USUARIO_INICIAL_SENHA`.

Opcionais, para o **resumo semanal por e-mail** (segunda-feira, 07:30 de
Maceió, rota `/api/cron/resumo`): `RESEND_API_KEY` (conta em resend.com),
`RESUMO_EMAIL_PARA` (um ou mais e-mails separados por vírgula) e
`RESUMO_EMAIL_DE` (remetente verificado no Resend). Sem elas, o cron só
registra o resumo no painel.

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
| `npm test` | Testes: módulos puros com números na mão e todas as consultas do banco num Postgres em processo (PGlite) com dados de exemplo |

## Estrutura

- `src/lib/pluggy/` — cliente da API, regra de sinal (`movimentacoes.ts`) e sync
- `src/lib/regras.ts` — motor de categorização (puro); `src/lib/pessoas.ts` — reconhecimento de pessoas (puro); `src/lib/estornos.ts` — pareamento de estornos (puro)
- `src/lib/revisao.ts` — sugestões da caixa de revisão (puro); `src/lib/alertas.ts` — motor de alertas (puro); `src/lib/recorrencias.ts` — previsão de pagamentos recorrentes (puro)
- `src/lib/relatorios.ts` (puro) e `src/lib/relatorios-dados.ts` — os relatórios; `src/db/queries/` — todas as leituras do banco
- `src/lib/permissoes.ts` — papéis; `src/lib/auditoria.ts` — registro do que mudou
- `src/lib/dre.ts` — DRE, rateio das vendas e saldos (puro); `src/lib/resumo.ts` — os números da tela inicial
- `src/lib/vendas-por-produto.ts` — leitura do mix colado e a regra de classificação dos itens da loja
- `src/lib/extrato-filtros.ts` — os filtros do extrato na URL; `src/lib/extrato.ts` — visão por nome
- `src/lib/categorizacao.ts` — aplica as regras no banco
- `src/app/api/cron/pluggy`, `src/app/api/webhooks/pluggy` — sync automático; `src/app/api/cron/resumo` — resumo semanal; `src/app/api/extrato/exportar`, `src/app/api/relatorios/[tipo]` — CSV
