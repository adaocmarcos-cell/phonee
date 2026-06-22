Vou criar um módulo completo de Usuários e Permissões para o Mobile+, com cargos, permissões granulares por módulo, auditoria e segurança. Por ser grande, proponho entregar em **3 fases**. Confirme antes que eu siga.

## Escopo & decisões importantes

1. **Multi-loja:** o sistema atual já é multi-loja (tabela `stores`, `user_roles` por loja). O novo módulo respeitará isso — Admin Master é global, demais cargos são por loja.
2. **Cargos:** os 8 cargos pedidos (Admin Master, Administrador, Gerente, Vendedor, Estoque, Financeiro, Técnico, Atendimento) serão **predefinidos**, com permissões padrão editáveis, e haverá suporte a **cargos customizados**.
3. **Senha & login:** o sistema usa autenticação por e-mail (Lovable Cloud). Não criarei "login" separado — manteremos e-mail como identificador único; "Celular" entra como campo do perfil. Criação de usuário envia convite por e-mail.
4. **Convidar vs criar:** novos usuários recebem **convite por e-mail** (padrão seguro). Admin Master define cargo e permissões antes do primeiro acesso.
5. **Remoção de "API/Bling":** farei um sweep no código removendo qualquer rótulo desse tipo (se encontrar) e nunca introduzirei novos.
6. **Logs:** registrados via tabela `audit_log` (já existe). Vou expandir colunas (IP, user agent, valor antigo/novo) e gravar via **edge function** para capturar IP/UA com confiabilidade. Logs são **imutáveis** (sem UPDATE/DELETE, nem para Admin Master) via policies.
7. **Segurança extra (bloqueio por tentativas, logout por inatividade, restrição de horário):** implemento client-side + checagens server-side onde possível. HIBP (senha vazada) habilitado no Auth.

## Fase 1 — Banco + papéis + UI base (esta entrega)

**Migração SQL:**
- Expandir `app_role` enum: adicionar `admin_master`, `administrador`, `estoque`, `financeiro`, `tecnico`, `atendimento` (mantém `dono`, `gerente`, `vendedor`).
- Tabela `role_permissions` (store_id, role, module, action, allowed) com defaults seed por cargo.
- Tabela `user_profile_extras` (phone, status, allowed_hours_json, last_login_at, failed_attempts).
- Expandir `audit_log` com `ip`, `user_agent`, `module`, `screen`, `old_value`, `new_value`, `role`.
- Policies: `audit_log` permite SELECT só para Admin Master; INSERT só via service_role; **revoga UPDATE/DELETE** de todos.
- Function `has_permission(_user, _store, _module, _action)`.
- Trigger `on_auth_login` para gravar `last_login_at`.

**UI:**
- Novo grupo no menu: **Usuários e Permissões** com 4 itens (Usuários / Cargos e Funções / Permissões / Logs e Auditoria).
- Página **Usuários** (lista + CRUD + convite + ativar/desativar + restrição de horário).
- Página **Cargos e Funções** (lista cargos padrão + criar customizado).

## Fase 2 — Permissões granulares + enforcement

- Página **Permissões**: matriz por cargo × módulo × ação (7 ações: visualizar/criar/editar/excluir/exportar/aprovar/gerenciar) organizada em 8 abas (Cadastros, Suprimentos, Vendas, Finanças, Serviços, Preferências, Contabilidade, Outros) com "Selecionar tudo".
- Hook `usePermission(module, action)` aplicado nos botões/rotas existentes (Estoque, Pedidos, Vendas, OS, Financeiro, Configurações, Tabelas de Preço, etc.).
- Guardas em rotas (`ProtectedRoute` estendido).

## Fase 3 — Auditoria + segurança

- Edge function `log-action` que recebe `{module, action, screen, target_id, old, new}` e grava IP/UA do request.
- Wrapper client `logAction(...)` chamado em todas mutações críticas (preço, estoque, financeiro, permissões, OS).
- Página **Logs e Auditoria** (somente Admin Master): tabela com filtros (usuário, cargo, módulo, ação, datas, status) + export PDF/Excel.
- Segurança: contador de tentativas falhas, lockout temporário, idle-timeout (logout após X min), HIBP via `configure_auth`.

## Detalhes técnicos relevantes

- **Cargos vs Funções:** "Cargo" = role do enum (controla permissões). "Função" = texto livre descritivo no perfil (ex.: "Vendedor Sênior").
- **Admin Master:** verificado por `has_role(uid, store_id, 'admin_master')` OU `is_owner` — bypass de qualquer outra permissão.
- **Imutabilidade dos logs:** `REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated, anon, service_role` + policies sem WITH CHECK de update. Inserts feitos exclusivamente pela edge function com `SUPABASE_SERVICE_ROLE_KEY`.
- **Horário de acesso:** checado no `AuthContext` ao montar; se fora da janela, logout + toast.

## O que NÃO entra agora (a confirmar depois)

- Recursos não existentes hoje (Frente de Caixa, Propostas Comerciais, NF-e, Boletos, Certificados Digitais, Contabilidade Fiscal, Transportadores): aparecerão na matriz de permissões com flag "módulo futuro" e ficarão desabilitados até serem construídos.
- Refactor completo dos textos "fornecedor/cliente" já existentes — só removerei o que mencionar API/Bling/Web Services se aparecer.

---

**Posso seguir com a Fase 1 agora?** Se quiser ajustar (ex.: mudar lista de cargos, transformar "login" em campo separado mesmo, ou priorizar Auditoria antes das Permissões), me diga antes que eu rode a migração.