
## 1. URLs do sistema em português simplificado

Hoje as rotas usam `/app/...` em inglês como base e alguns segmentos ainda em inglês (`trade-in`, `os`, `auth`, `forgot-password`, `reset-password`). Vou renomear para PT, mantendo apenas o segmento raiz e os submenus 100% em português curto.

**Mudanças de rota (visíveis ao usuário):**

| Antes | Depois |
|---|---|
| `/app` | `/painel` |
| `/app/estoque` | `/painel/estoque` |
| `/app/estoque/novo` | `/painel/estoque/novo` |
| `/app/estoque/relatorio` | `/painel/estoque/relatorio` |
| `/app/estoque/transferencia` | `/painel/estoque/transferencia` |
| `/app/curva-abc` | `/painel/curva-abc` |
| `/app/trade-in` | `/painel/troca` |
| `/app/trade-in/novo` | `/painel/troca/novo` |
| `/app/pedidos` | `/painel/pedidos` |
| `/app/pedidos/novo` | `/painel/pedidos/novo` |
| `/app/vendas` | `/painel/vendas` |
| `/app/vendas/nova` | `/painel/vendas/nova` |
| `/app/despesas` | `/painel/despesas` |
| `/app/financeiro` | `/painel/financeiro` |
| `/app/clientes` | `/painel/clientes` |
| `/app/os` | `/painel/ordens` |
| `/app/os/nova` | `/painel/ordens/nova` |
| `/app/pecas` | `/painel/pecas` |
| `/app/pecas/vendas` | `/painel/pecas/vendas` |
| `/app/alertas` | `/painel/alertas` |
| `/app/tabelas-preco` | `/painel/tabelas` |
| `/app/suporte` | `/painel/suporte` |
| `/app/admin/lojas` | `/painel/lojas` |
| `/app/admin/usuarios` | `/painel/usuarios` |
| `/app/admin/cargos` | `/painel/cargos` |
| `/app/admin/garantias` | `/painel/garantias` |
| `/app/admin/permissoes` | `/painel/permissoes` |
| `/app/admin/logs` | `/painel/logs` |
| `/app/admin/ajustes-estoque` | `/painel/ajustes-estoque` |
| `/app/admin/configuracoes` | `/painel/configuracoes` |
| `/app/admin/pagamentos` | `/painel/pagamentos` |
| `/app/admin/planos` | `/painel/planos` |
| `/app/admin/assinaturas` | `/painel/assinaturas` |
| `/app/admin/logs-pagamento` | `/painel/logs-pagamento` |
| `/app/admin/suporte` | `/painel/suporte-admin` |
| `/auth` | `/entrar` |
| `/forgot-password` | `/esqueci-senha` |
| `/reset-password` | `/redefinir-senha` |

**Compatibilidade:** as rotas antigas (`/app/*`, `/auth`, etc.) continuam funcionando como **redirect 301-style** (`<Navigate replace>`) para não quebrar links existentes ou abas abertas.

**Arquivos afetados:** `src/App.tsx`, `AppSidebar.tsx`, `AppLayout.tsx`, `StoreSwitcher.tsx`, `StoreSubscriptionBanner.tsx`, `PageHeader.tsx`, `Auth.tsx`, e os 15 arquivos em `src/pages/app/*` que fazem `navigate("/app/...")`.

---

## 2. Painel oculto Mobile+ (você, dono da plataforma)

Painel separado, **fora** do `/painel` do usuário, só acessível por quem tem o papel `admin_master` (já existe no banco via `is_admin_master`).

**URL:** `/mobileplus`  → tela de login dedicada
**Após login válido + checagem `admin_master`:** `/mobileplus/visao-geral`

### Submenus do painel Mobile+

| Rota | Conteúdo |
|---|---|
| `/mobileplus/visao-geral` | KPIs da plataforma: lojas ativas, MRR estimado, ticket médio por loja, churn, novas assinaturas no mês, crescimento mês a mês |
| `/mobileplus/lojas` | Lista todas as lojas: dono, plano, ciclo (anual/vitalício), status da assinatura, faturamento da loja, última atividade |
| `/mobileplus/usuarios` | Lista todos os usuários da plataforma com filtro por loja, papel, último login |
| `/mobileplus/assinaturas` | Todas as assinaturas, status no Asaas, próximas renovações, inadimplência |
| `/mobileplus/financeiro` | Receita Mobile+ por mês, por plano, por ciclo, lojas adicionais |
| `/mobileplus/crescimento` | Análise de crescimento: funil de signup → trial → ativação → pagamento, lojas com maior ticket médio, recomendações para upgrade |
| `/mobileplus/suporte` | Tickets globais (já existe `SuporteAdmin`, reutilizado aqui) |

### Acesso (autenticação)

- Tela `/mobileplus` reaproveita o fluxo de e-mail/senha do Supabase (mesma base de usuários — você já tem conta).
- Após signIn, faz `select role from user_roles where user_id = auth.uid() and role = 'admin_master'`. Se não retornar nada, faz signOut imediato e mostra "Acesso restrito".
- Guard `AdminMasterRoute` envolve todas rotas `/mobileplus/*`.
- O link **não aparece** em nenhum menu do sistema normal — você acessa digitando a URL.

### Como você ganha o papel `admin_master`

Como hoje ainda não há registro, vou rodar uma migração de dados que insere na tabela `user_roles` o seu user_id (do auth) como `admin_master`. **Preciso que você me passe o e-mail da conta** que vai administrar a plataforma — eu busco o ID e faço o INSERT.

### Componentes / arquivos novos

- `src/pages/mobileplus/Login.tsx`
- `src/pages/mobileplus/Layout.tsx` (sidebar própria, identidade Mobile+, separada visualmente)
- `src/pages/mobileplus/VisaoGeral.tsx`
- `src/pages/mobileplus/Lojas.tsx`
- `src/pages/mobileplus/Usuarios.tsx`
- `src/pages/mobileplus/Assinaturas.tsx`
- `src/pages/mobileplus/Financeiro.tsx`
- `src/pages/mobileplus/Crescimento.tsx`
- `src/components/layout/AdminMasterRoute.tsx`
- 1 RPC SQL `mobileplus_overview()` (SECURITY DEFINER, restrita a `admin_master`) que devolve as métricas agregadas — evita N queries no front.

### Segurança

- Todas as queries do painel passam pela RPC `SECURITY DEFINER` que internamente faz `IF NOT is_admin_master(auth.uid()) THEN RAISE EXCEPTION 'forbidden'`.
- Nenhuma rota `/mobileplus/*` aparece no `sitemap` nem no menu — discoverability zero.
- RLS continua valendo no resto do sistema; o `admin_master` só vê dados agregados via RPC, não burla o tenant das lojas.

---

## Confirmar antes de executar

1. Posso renomear `/app` → `/painel` em massa e adicionar redirects das URLs antigas?
2. **Qual o e-mail da sua conta Mobile+** para eu marcar como `admin_master`?
3. URL do painel oculto: `/mobileplus` está bom, ou prefere algo menos óbvio (ex: `/gestao-mobile`, `/m-plus`)?
