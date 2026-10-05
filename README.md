# Safran · Financeiro

DRE e fluxo de caixa da Safran Alimentos LTDA, montados a partir do extrato da
conta bancária da empresa, puxado da [Pluggy](https://pluggy.ai) via Open
Finance. Sistema separado do sistema de gestão (pedidos, fichas técnicas) e em
contas próprias da Safran (GitHub, Vercel, Supabase, Pluggy).

## Como funciona

1. **Extrato** (`/extrato`) — a conta é conectada pelo widget da Pluggy
   (*Conectar banco*) e sincronizada todo dia às 07:00 (Maceió), a cada aviso
   do banco (webhook) ou pelo botão *Sincronizar agora*.
2. **Categorização** — cada movimentação recebe uma categoria do plano de
   contas. Ao escolher uma, o sistema oferece *aplicar a todas* da mesma
   contraparte: isso vira uma regra, que vale para o passado e para o que
   chegar depois. Escolha manual nunca é mudada por regra.
3. **DRE** (`/dre`) — regime de caixa, mês a mês:
   receita bruta − deduções = receita líquida − custos variáveis =
   **margem de contribuição** − despesas fixas = resultado operacional ±
   financeiro = **resultado líquido**. Cada valor leva às movimentações dele.
4. **Fluxo de caixa** (`/fluxo-de-caixa`) — saldo inicial, operação (o
   resultado da DRE), investimentos, empréstimos, sócios e saldo final. Os
   saldos são reconstruídos de trás para frente a partir do saldo de hoje.

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

Ver `.env.local.example`: `DATABASE_URL` (Session pooler da Supabase),
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
- `src/lib/dre.ts` — DRE e saldos (puro)
- `src/lib/categorizacao.ts` — aplica as regras no banco
- `src/app/api/cron/pluggy`, `src/app/api/webhooks/pluggy` — sync automático
