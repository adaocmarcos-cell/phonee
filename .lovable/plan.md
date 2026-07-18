
# Auditoria Interna — IMEI, Trade-in e Ordens de Serviço

> Este é um **relatório de auditoria** (somente leitura). Nada foi alterado. Ao final, listo o que sugiro fazer em seguida — mas apenas se você aprovar.

---

## 1) Controle de IMEI / Nº de Série

### (a) O que existe hoje
- **`trade_ins.imei` (text)** + `imei_status` (`nao_verificado|limpo|restrito`) — migration `20260622050543`.
- **`sale_items.imei_serial` (text)** — coluna adicionada em `20260703160230`; a RPC `create_sale` grava esse valor por item.
- **`service_orders.device_imei1`, `device_imei2`, `device_serial`** — migration `20260622152509`.
- UI usa IMEI em: `TradeInForm.tsx`, `TradeIn.tsx`, `TradeInDetails.tsx`, `VendaNova.tsx` (rascunho da troca), `OrdemServicoForm.tsx`, `OrdensServico.tsx`.
- `ProductForm.tsx:79-101` mostra um painel "procedência" que tenta reconstruir histórico do aparelho fazendo match do IMEI em `trade_ins` — **client-side, por string exato**.

### (b) Bugs / gaps concretos
1. **`products` NÃO tem coluna `imei`/`serial`.** Um aparelho parado em estoque não tem identidade própria — só existe IMEI enquanto está numa linha de `trade_ins` ou `sale_items`.
2. **`parts_inventory` também não tem serial**.
3. **Nenhuma constraint `UNIQUE` nem índice em nenhuma coluna de IMEI/serial** em qualquer tabela. Dá pra cadastrar o mesmo IMEI em vários `trade_ins` e várias vendas sem conflito.
4. **`checkImei()` em `TradeInForm.tsx:138-144` é mock:** só valida `length >= 14` (comentário diz "15 dígitos", código está errado) e marca como "restrito" se termina em `"000"`. Não há integração real (Anatel/GSMA) nem checagem Luhn.
5. **Nenhum schema Zod valida formato de IMEI** em nenhum lugar — é `string` livre.
6. **Trade-in ↔ Venda não têm link por identidade de aparelho**, só por `trade_ins.product_id` (nullable, `ON DELETE SET NULL`). Se o produto derivado for excluído/religado, a trilha do IMEI silenciosamente quebra.
7. **Sem view/RPC de histórico por IMEI** — não dá pra responder "onde este aparelho passou?" numa única consulta. `ProductForm.tsx` só olha `trade_ins`.

### (c) O que falta pra ficar completo
- Coluna `imei`/`serial` em `products` (e opcionalmente `parts_inventory`), com **índice único parcial** (`WHERE imei IS NOT NULL`).
- Validação real (regex 15 dígitos + Luhn) em schema Zod compartilhado.
- View/RPC `get_device_history(imei)` unindo `trade_ins`, `sale_items`, `stock_movements`, `service_orders`, `sale_returns`.
- (Opcional) integração externa de status de IMEI.

---

## 2) Trade-in / Seminovos

### (a) O que existe hoje
- Tabela `trade_ins` completa (`entry_value`, `intended_sale_value`, `condition`, `checklist`, `photos_in/out`, `repair_costs`, `scrap_for_parts`, `repair_parts`, `product_id`, `received_in_sale_id`, `status` enum `em_avaliacao|aprovado|em_estoque|vendido|recusado`).
- Trigger **`tg_tradein_to_product`** (BEFORE UPDATE OF status) cria linha em `products` com `cost_price = entry_value + repair_costs`, `sale_price = intended_sale_value`, `stock_current = 1`.
- Trigger **`tg_tradein_sync_product_cost`** (AFTER UPDATE) atualiza `products.cost_price` quando `entry_value`/`repair_costs` mudam depois.
- RPC **`finish_trade_in_repair`** consome peças de `parts_inventory`, calcula `parts_cost + manual_cost`, grava em `trade_ins.repair_costs`, muda status para `em_estoque` (com guarda de idempotência).
- RPC **`create_sale`** aceita `_trade_in` (cria trade-in dentro da transação da venda, com `received_in_sale_id`) e método de pagamento `troca` em `sale_payments.trade_in_id`.
- **`get_dashboard_metrics`** já separa `v_recebido_caixa` (≠ troca) de `v_recebido_troca` — DRE/caixa NÃO dobra receita.
- `sale_items.unit_cost` é snapshot no momento da venda → **CMV correto na revenda** mesmo que `cost_price` mude depois.
- Bug histórico já corrigido: migration `20260713130551` limpou `expenses` criadas indevidamente na entrada da troca e desativou o caminho de `entry_expense_id`.

### (b) Bugs concretos
1. **Nada seta `trade_ins.status = 'vendido'` na revenda.** Nem trigger, nem RPC, nem UI escreve esse valor. O enum, `src/lib/tradeInStatus.ts` e `TradeInReconciliacao.tsx` já pressupõem essa transição. Resultado: aparelhos revendidos ficam eternamente como "Em estoque" na lista de trade-in (não corrompe financeiro — apenas relatório).
2. **Comissão sobre parcela em "troca":** não achei nenhum código de comissão que exclua `sale_payments.method = 'troca'` da base. Se a intenção era comissionar só sobre caixa recebido, hoje há distorção — o vendedor ganha comissão sobre o valor pago com aparelho.
3. **Coluna `entry_expense_id` é peso morto** (nada mais escreve nela após o cleanup de `20260713130551`).
4. **Sem cleanup do produto órfão** se um trade-in for excluído/recusado depois que já gerou linha em `products`. `ON DELETE SET NULL` no `trade_ins.product_id` deixa o produto sem back-reference.

### (c) O que falta
- Trigger em `create_sale`/`sale_items` que, ao vender item cujo `product_id` bate com `trade_ins.product_id`, mude status para `vendido` e grave o `sale_id` para reconciliação.
- Decisão explícita (e implementação) sobre comissão em pagamentos `troca`.
- Remoção da coluna `entry_expense_id`.
- Fluxo de reversão coerente para trade-ins voidados após produto criado.

---

## 3) Ordens de Serviço (O.S.)

### (a) O que existe hoje
- **`service_orders` (50+ colunas)**: cliente (texto livre), aparelho + IMEI1/IMEI2/serial, checklists (recebimento/execução/entrega), fotos, `parts_value`/`labor_value`/`total_value`/`net_value`, `technician_id`, assinaturas cliente/técnico, `public_token`, `budget_status`, `budget_decided_*`.
- **`service_order_parts`** vincula peças à OS.
- **`parts_inventory`** = pool de estoque separado dos `products`.
- **`os_status_history`** com trigger `trg_service_orders_log_status` (imutável, INSERT-only).
- **`whatsapp_templates`** por loja (auto-seed via `tg_stores_seed_whatsapp`) + `whatsapp_messages_log`.
- **`warranty_settings`** por loja.
- **`PublicOs.tsx`** + RPCs `get_public_os` / `approve_public_budget` (aprovação pública com IP/nome auditados).
- **Comissão de técnico automatizada:** trigger `tg_os_apply_commissions` chama `apply_commissions_for_os` quando status → `entregue`, e estorna quando sai.
- Numeração automática (`assign_os_number`).
- Impressão de laudo em HTML + `window.print()` em `OrdemServicoForm.tsx`.

### (b) Bugs concretos
1. **Baixa de estoque de peças é feita no client-side, em 2 writes não-atômicos** (`PartsInventory.tsx:222-234`): `insert service_order_parts` + `update parts_inventory set stock_current = valor_do_cliente - qty`. Problemas:
   - **Race condition:** valor de `stock_current` vem do estado local (stale), não faz `stock_current = stock_current - qty` no SQL.
   - **Sem transação:** se o `update` falhar, a peça fica registrada como usada sem baixa.
2. **Sem trigger/RPC no server** decrementando `parts_inventory` — só existe alerta pós-fato de estoque negativo (`20260623142032`), sem bloqueio.
3. **`stock_movements` não cobre `parts_inventory`** (trigger `tg_products_stock_ledger` só está em `products`). Peças usadas em OS não aparecem no ledger, apesar do enum já ter `'uso_os'` e existir backfill histórico.
4. **Nenhuma RPC `finish_os`/`close_os`**: fechar OS é `UPDATE` cru do client. Qualquer usuário com permissão pode marcar `entregue` sem checklist/assinatura — os campos existem mas nada valida no DB.
5. **`get_public_os` hardcoda 90 dias de garantia** ignorando `warranty_settings.default_days`.
6. **`net_value`/`net_value_reason` são colunas mortas** — nenhuma UI usa, nenhum pipeline financeiro consome.
7. **Cliente e aparelho não são normalizados:** sem FK para `customers`, sem tabela `devices`. Impossível ver "todas as OS deste cliente/aparelho" sem string-match frágil.
8. **Busca por IMEI é client-side sobre `.limit(500)`** (`OrdensServico.tsx:128`). Sem índice em `device_imei1/2`. Falha em lojas grandes.
9. **RLS de `service_order_parts` sem restrição de papel** — qualquer membro da loja insere/edita/deleta uso de peça.
10. **PDF inconsistente:** OS usa `window.print()` de HTML, enquanto o resto do app usa jsPDF/autotable.
11. **Fluxo de fechamento não gera `sales`/`sale_receivables`** — receita de OS não flui para caixa/crediário como as vendas fazem.

### (c) O que falta
- RPC atômica `close_os` validando checklist + assinatura, decrementando peças com `stock_current = stock_current - qty AND stock_current >= qty`, gravando `stock_movements` do tipo `uso_os`, opcionalmente criando `sales`/`sale_receivables`.
- Estender `tg_products_stock_ledger` (ou criar gêmea) para `parts_inventory`.
- Restrição de papel em `service_order_parts` (RLS).
- `customer_id` FK em `service_orders`; opcional tabela `devices` indexada por IMEI.
- Índices em `device_imei1`, `device_imei2`, `device_serial`.
- Persistir `warranty_days`/`warranty_until` na própria OS no momento da entrega, lendo `warranty_settings`.
- Rastreio de sinistro de garantia (OS filha apontando pra original).
- Decisão sobre `net_value` (usar ou remover).
- Enforcement server-side: não permitir status `entregue` sem `customer_signature`/`delivery_checklist` completo.

---

## Próximos passos sugeridos (só executamos se você aprovar)

Ordenados por impacto/risco:

1. **Bug rápido & isolado:** trigger para setar `trade_ins.status='vendido'` na revenda.
2. **Bug de estoque com risco financeiro:** mover baixa de peças (OS) para RPC atômica com guarda de negativo + ledger.
3. **Identidade do aparelho:** adicionar `products.imei/serial` + índice único parcial + validação Zod + view `get_device_history(imei)`.
4. **Fechamento de OS:** RPC `close_os` com enforcement de checklist/assinatura e (opcional) geração de `sales`/`sale_receivables`.
5. **Normalização:** `customer_id` em `service_orders`; índices em IMEI da OS.
6. **Limpeza:** decidir `net_value`, remover `entry_expense_id`, ler `warranty_settings` em `get_public_os`.

Diga quais itens quer transformar em plano executável (posso detalhar migrations, RPCs e mudanças de UI para cada um separadamente).
