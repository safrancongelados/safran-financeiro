# Safran · Financeiro

Sistema de DRE e fluxo de caixa da Safran Alimentos LTDA ("Safran
Congelados", Maceió/AL, CNPJ 31.511.591/0001-95), a partir do extrato da conta
bancária única da empresa (Pluggy / Open Finance). Ver `README.md`.

- Separado do sistema de gestão (repositório `safran`): não lê pedidos nem
  fichas técnicas. A única fonte é o extrato.
- Valores sempre em centavos inteiros, com o sinal do caixa.
- DRE em regime de caixa; o plano de contas (tabela `categorias`) define em
  que linha cada movimentação cai (`grupo_dre`).
- Contas próprias da Safran: GitHub `safrancongelados`, Vercel, Supabase
  (projeto "financas") e Pluggy. Nunca commitar credenciais.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
