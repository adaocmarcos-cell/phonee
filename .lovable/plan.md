# Auditoria, validações e vínculos em lote

## 1. Página de Audit Log (`/phonee/audit-log`)

Nova rota admin-master com timeline unificada.

**Backend (migration):**
- RPC `phonee_audit_log(_store_id, _user_id, _action, _from, _to, _limit, _offset)` que retorna registros de `audit_log` com join em `profiles` (nome/email do autor e do alvo) e `stores` (nome).
- Fontes exibidas: `audit_log` (todas as ações) + resultado atual de `phonee_permission_audit()` como aba separada ("Problemas atuais de vínculo").
- Apenas admin master pode chamar.

**Frontend `src/pages/phonee/AuditLog.tsx`:**
- Filtros: loja (select), usuário autor (autocomplete por email), motivo/ação (select com valores distintos: `permission_change`, `checksum_falha`, `role_change`, etc.), período (from/to).
- Timeline em ordem temporal decrescente, com badge da ação, delta (`old_value` → `new_value`), módulo/tela.
- Aba "Vínculos inconsistentes" listando `phonee_permission_audit` com badge de motivo.
- Paginação simples (limit/offset, botão "carregar mais").
- Link no Layout admin master.

## 2. Validação na tela de Vínculos

**Regras a validar antes de salvar (no submit e via tooltip preventivo):**
- `dono`: só pode ser atribuído se ainda não houver outro dono na loja (`stores.owner_id`). Caso contrário desabilita a opção com tooltip "Loja já possui dono — remova o dono atual primeiro".
- `administrador`: só pode ser atribuído por admin master (checar `is_admin_master`); gerente vê a opção desabilitada com tooltip.
- Não permitir atribuir cargo a `user_id` que não existe em `profiles` (validar via RPC leve `phonee_user_exists`).
- Não permitir vincular usuário já vinculado com o mesmo cargo (evita duplicação silenciosa).
- Não permitir remover o próprio cargo do usuário logado se ele é o único gerente/dono ativo.

**Implementação:**
- Nova RPC `phonee_validate_role_assignment(_user_id, _store_id, _role)` retornando `{ ok boolean, reason text }`.
- No `<Select>` do cargo, envolver cada `SelectItem` em Tooltip mostrando o motivo quando desabilitado (consultar estado local computado a partir de `bindings` + flags do admin).
- No submit do dialog de "Adicionar vínculo", chamar a RPC de validação e mostrar toast + tooltip inline caso reprove.

## 3. Vínculo em lote

**UI:** botão "Vincular em lote" abre um dialog com:
- Textarea com um e-mail por linha (ou colar CSV `email,role`).
- Select global do cargo padrão (usado quando não vier na linha).
- Botão "Pré-validar": chama nova RPC `phonee_bulk_validate_bindings(_store_id, _rows jsonb)` que retorna, para cada linha, `{ email, user_id, role, status: 'ok'|'user_not_found'|'invalid_role'|'already_bound'|'duplicate_owner', reason }`.
- Tabela de resultados com badges por status. Botão "Aplicar apenas os OK" só habilita se houver pelo menos 1 OK.
- Ao aplicar, chama `phonee_bulk_bind(_store_id, _rows jsonb)` que executa em transação, ignora não-OK, grava um `audit_log` por atribuição e retorna resumo `{ inserted, skipped, errors[] }`.
- Toast final com o resumo.

## 4. Teste E2E de RLS via UI

**Seed:** script `tests/e2e/setup/seed-rls.ts` que usa o service role (via edge function dedicada `test-seed-rls`, pois o service role não é acessível no cliente) para criar:
- 2 lojas (`storeA`, `storeB`).
- 4 usuários: `owner@a.test` (dono A), `manager@a.test` (gerente A), `seller@a.test` (vendedor A), `outsider@b.test` (dono B).
- 1 venda e 1 pedido de compra na `storeA`.
- Retorna credenciais one-time (senhas geradas).

**Teste `tests/e2e/rls-sales-purchases.spec.ts` (Playwright):**
- Para cada usuário: login pela UI → navega até `/app/vendas` → tenta editar a venda seed → captura resultado (sucesso vs erro).
- Cenários esperados:
  - `owner@a.test`: edita venda ✅ e vê compra da loja A ✅.
  - `manager@a.test`: edita venda ✅ e vê compra ✅.
  - `seller@a.test`: edita venda ✅ (por padrão liberado) — teste captura o estado como baseline.
  - `outsider@b.test`: não vê venda nem compra da loja A ❌ (deve aparecer vazio).
- Cleanup: chama edge function `test-seed-rls?cleanup=1` no `afterAll`.

**Detalhes técnicos (para a persona técnica):**
- Timeline usa `TZ America/Sao_Paulo` formatado com `date-fns-tz`.
- Todas as novas RPCs `SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated`, com checagem inicial de `is_admin_master` ou `is_owner/has_role('gerente')` conforme o escopo.
- Edge function de seed lê `SUPABASE_SERVICE_ROLE_KEY` do secret já existente no ambiente Lovable Cloud e é protegida por um header `x-test-seed-token` (novo secret que o usuário confirma antes do primeiro run).

## Ordem de execução
1. Migration: RPCs de audit log, validação e lote.
2. Frontend: `AuditLog.tsx`, updates em `Vinculos.tsx` (validação + lote), rota + link no Layout.
3. Edge function `test-seed-rls` + spec Playwright + doc curto em `tests/e2e/README.md`.
