# Integração Asaas — Mobile+

## Visão geral
Permitir compra pública dos planos Mobile+ pelo site, com cobrança PIX/cartão via Asaas. O acesso ao painel só é liberado após pagamento confirmado. Admin Master gerencia configuração, assinaturas, reembolsos e logs.

## 1. Banco de dados (1 migração)

**`asaas_settings`** (linha única, somente Admin Master)
- environment (`sandbox` | `production`)
- api_key_set (boolean — chave fica no secret, esta flag só indica se está configurada)
- webhook_token_set (boolean)
- wallet_id, account_email, connection_status, last_tested_at

**`plans`** (gerenciável pelo Admin Master)
- code (`annual` | `lifetime`), name, price_cents, max_installments, active

**`subscriptions`**
- customer_name, customer_email, customer_phone, customer_doc (CPF/CNPJ)
- plan_id, payment_method (`PIX`|`CREDIT_CARD`), status
- asaas_customer_id, asaas_charge_id, invoice_url, pix_qr_code, pix_copy_paste
- amount_cents, started_at, expires_at (null = vitalício)
- user_id (preenchido após criar conta), refund_requested_at, refund_status

**`payment_logs`** (append-only)
- subscription_id, event_type, status, amount_cents, asaas_payload (jsonb), action, created_at

**RLS**: `asaas_settings`/`payment_logs` só Admin Master; `subscriptions` Admin Master lê tudo, usuário vê as próprias; `plans` leitura pública (anon+authenticated), escrita só Admin Master.

GRANTs explícitos em todas as tabelas conforme regra do projeto.

## 2. Secrets (backend)
Pedir ao usuário via add_secret:
- `ASAAS_API_KEY` — chave da API Asaas
- `ASAAS_WEBHOOK_TOKEN` — token validado no header `asaas-access-token`

Nunca expostos no frontend.

## 3. Edge Functions

| Função | JWT | Função |
|---|---|---|
| `asaas-test-connection` | sim (Admin Master) | testa GET /myAccount |
| `asaas-create-charge` | não (público) | valida input, cria customer + payment no Asaas, grava `subscription` pendente, devolve QR/URL |
| `asaas-webhook` | não | valida `asaas-access-token`, atualiza subscription, cria conta no auth, dispara e-mail boas-vindas |
| `asaas-refund` | sim (Admin Master) | POST /payments/{id}/refund |
| `asaas-resend-charge` | sim (Admin Master) | reenvia link cobrança |

Todas com CORS, validação Zod, log em `payment_logs`.

## 4. Bloqueio de login sem pagamento
- Após confirmar pagamento, webhook cria usuário via `auth.admin.createUser` com senha aleatória + envia e-mail de boas-vindas com link "definir senha" (`resetPasswordForEmail`).
- Em `Auth.tsx`, após `signInWithPassword` bem-sucedido: verificar `subscriptions.status = 'active'` para o e-mail; se não houver, fazer signOut e mostrar "Pagamento não localizado".
- Bloquear `signUp` público no formulário de login (somente compra cria conta). Login passa a ter só "Entrar" + "Esqueci senha".

## 5. Páginas/UI

**Pública**
- `/comprar` — escolha do plano (Anual / Vitalício R$ 297, até 12x), formulário (nome, CPF/CNPJ, e-mail, WhatsApp), método (PIX/Cartão), botão "Pagar".
- `/comprar/sucesso/:id` — exibe QR Code PIX (imagem + copia-e-cola) ou redireciona para invoice de cartão. Faz polling de status a cada 5s e mostra "Pagamento confirmado → e-mail enviado".
- Botões "Comprar Agora" da landing apontam para `/comprar?plano=annual|lifetime`.

**Admin Master (`/app/admin/...`)**
- `Pagamentos Asaas` — formulário de configuração + "Testar conexão" + status.
- `Planos` — editar preço/parcelas dos dois planos.
- `Assinaturas` — tabela com filtros, ações: reenviar, cancelar, reembolsar (com confirmação), aprovar pedidos de reembolso ≤7 dias.
- `Logs de pagamento` — tabela read-only.

## 6. Visual
Mantém identidade Mobile+ (azul escuro, azul neon, branco, logo central). Componentes shadcn já existentes, responsivo.

## Detalhes técnicos
- API Asaas: `https://api.asaas.com/v3` (prod) ou `https://sandbox.asaas.com/api/v3`, header `access_token: <API_KEY>`.
- Cliente: `POST /customers` (cpfCnpj, name, email, phone)
- Cobrança PIX: `POST /payments` `{billingType:"PIX"}` + `GET /payments/{id}/pixQrCode`
- Cobrança Cartão: `POST /payments` `{billingType:"CREDIT_CARD", installmentCount}` → usa `invoiceUrl` (checkout hospedado pelo Asaas, mais seguro que tokenizar cartão no frontend).
- Webhook valida `req.headers["asaas-access-token"] === ASAAS_WEBHOOK_TOKEN`.
- Garantia 7 dias: cliente pede reembolso (`refund_requested_at`); Admin Master aprova → chama `asaas-refund` → marca `status='refunded'` + revoga acesso (delete user role).

## Ordem de execução
1. Migração (tabelas + RLS + GRANTs + roles).
2. Pedir secrets `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`.
3. Edge functions.
4. Páginas públicas de compra.
5. Páginas Admin Master.
6. Ajuste no `Auth.tsx` (bloqueio sem pagamento) e botões da landing.

## Pergunta antes de começar
- **Valor padrão do Plano Anual?** (Vitalício já = R$ 297. Anual ficou "a definir no painel" — posso usar R$ 127/ano como padrão inicial, igual ao texto atual da landing, e você ajusta depois no painel?)
- **Acesso vitalício** = nunca expira (`expires_at = null`). Anual = `started_at + 12 meses`. Ok?
- Confirma que quero criar a conta automaticamente no webhook e enviar e-mail de "definir senha" (em vez de pedir senha no checkout)?
