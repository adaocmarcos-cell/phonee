
## Visão geral

Implementar o programa de indicações com bonificação automática (R$ 10 por assinatura confirmada), painel do indicador, sistema de cupons gerenciável pelo admin master e dashboards de performance — tudo conectado às assinaturas reais (tabela `subscriptions`) e ao financeiro.

A entrega será dividida em três frentes: backend (banco + automações), painel do usuário (Indique e Ganhe) e painel do admin master (Cupons + Dashboards).

---

## 1. Backend (banco de dados)

### Novas tabelas
- `referral_codes` — código único por usuário (formato `PHONEE-XXXXXX`), gerado na primeira visita ao painel.
- `referrals` — registro de cada indicação: indicador, loja indicada, código usado, status (`pendente | convertida | cancelada`), bônus em R$, datas.
- `referral_credits` — extrato de créditos do indicador: tipo (`credito_indicacao | uso_desconto | ajuste_admin`), valor, saldo, referência.
- `coupons` — código, tipo (`valor` | `percentual`), valor, validade, limite de usos, usos atuais, parceiro associado, ativo.
- `coupon_redemptions` — cada uso de cupom: cupom, loja, assinatura, valor de desconto aplicado, data.

Cada tabela com RLS, GRANTs e índices apropriados. Indicadores só leem seus próprios registros; admin master vê tudo.

### Funções e triggers
- `generate_referral_code(_user_id)` — cria/retorna o código único do usuário.
- `register_referral(_ref_code, _store_id)` — chamada quando uma loja se cadastra com `?ref=...`; cria entrada em `referrals` como `pendente`.
- `apply_coupon(_code, _store_id, _amount_cents)` — valida cupom (validade, limite, ativo) e devolve o desconto aplicado.
- Trigger em `subscriptions`: quando `status` muda para `active`/`ativa`/`vitalicio`, marca o `referrals` correspondente como `convertida` e gera crédito de R$ 10 em `referral_credits`. Se subscription for cancelada antes da conversão real, marca como `cancelada`.

### Integração com checkout existente
- Página de cadastro (`/cadastro`) lê `?ref=` da URL e armazena em `localStorage` até o cadastro concluir.
- Modal/checkout de assinatura (Asaas) ganha campo "Cupom de Desconto". Valor é validado via RPC `apply_coupon` antes de enviar para `asaas-create-charge`.
- Edge function `asaas-webhook` (já existente) dispara a conversão da indicação no `status = PAYMENT_RECEIVED/CONFIRMED`.

---

## 2. Painel "Indique e Ganhe" (usuário logado)

### Acesso
- Novo item no `AppSidebar` (final da lista, separado por divisor, com ícone `Gift`).
- Botão "Indique e Ganhe" também na página `Vendas` (card destaque no topo ou na barra de ações).
- Rota: `/painel/indique-e-ganhe`.

### Conteúdo da página
- Cards no topo: Total de indicações · Pendentes · Convertidas · Saldo disponível (R$).
- Bloco "Seu código e link":
  - Código `PHONEE-AB1234` com botão copiar.
  - Link `https://phonee.com.br/cadastro?ref=AB1234` com botão copiar.
  - Botões de compartilhar: WhatsApp (mensagem pronta), Instagram (copia link + abre app), Facebook (sharer), Copiar.
- Tabela "Minhas indicações": loja indicada, data, status, bônus.
- Bloco "Usar saldo": botão para aplicar saldo como desconto na próxima mensalidade (gera registro em `referral_credits` tipo `uso_desconto`).
- Ranking público (top 10): "Os maiores indicadores do mês" — anônimo (primeiro nome + iniciais).

---

## 3. Painel do Admin Master

### Cupons (`/phonee/cupons`)
- Listagem com busca, filtros por status (ativo/expirado), por parceiro.
- Botão "Novo cupom" → dialog: código, tipo (R$ ou %), valor, validade, limite de usos, parceiro (texto livre), ativo.
- Ações por linha: editar, ativar/desativar, excluir (com confirmação), ver utilizações.

### Indicações (`/phonee/indicacoes`)
- Tabela de todas as indicações (indicador, loja indicada, status, bônus, data).
- Filtros e exportação CSV.
- Ação manual: cancelar / marcar como convertida (override).

### Dashboard de crescimento (já existente em `/phonee/crescimento`)
Acrescentar widgets:
- Novos usuários por indicação (30d / 12m).
- Receita gerada por indicações (assinaturas convertidas).
- Receita gerada por cupons.
- Top indicadores (mês e total).
- Taxa de conversão (convertidas / total).
- Economia concedida por cupons (somatório).

---

## 4. Fluxo end-to-end

```text
Usuário A copia link  -->  phonee.com.br/cadastro?ref=AB1234
                                        |
                  Loja B se cadastra   -->  referrals(pendente, indicador=A, loja=B)
                                        |
                      Loja B assina   -->  subscription pending
                                        |
   asaas-webhook PAYMENT_CONFIRMED   -->  trigger marca referral=convertida
                                                + insere credito R$10 para A
                                                + atualiza saldo de A
                                        |
              A aplica saldo no checkout -->  referral_credits(uso_desconto)
                                                desconto aplicado na assinatura
```

---

## 5. Detalhes técnicos

- Geração do código: `'PHONEE-' || upper(substr(md5(user_id || now()), 1, 6))`, único.
- Bônus configurável via `marketing_settings.referral_bonus_cents` (default 1000 = R$ 10).
- `apply_coupon` retorna `{ valid, discount_cents, message }`.
- Front: novo arquivo `src/pages/app/IndiqueGanhe.tsx`, `src/pages/mobileplus/Cupons.tsx`, `src/pages/mobileplus/Indicacoes.tsx`.
- Cadastro público (`/cadastro` ou fluxo equivalente) já existente: adicionar leitura do `ref` e do campo de cupom — confirmar no código atual onde é o cadastro de novas lojas.
- Sem mudanças de design global; reaproveita tokens existentes.

---

## 6. Entregáveis por etapa (uma migração + um lote de UI por vez)

1. Migração: tabelas, RLS, funções, trigger no `subscriptions`.
2. Backend extra: ajustar `asaas-webhook` para chamar a função de conversão.
3. Frontend usuário: rota `/painel/indique-e-ganhe`, item no sidebar, botão na Vendas.
4. Frontend admin: páginas de Cupons e Indicações + widgets no dashboard.
5. Integração do campo cupom no checkout existente.

Confirmar o plano para eu começar pela etapa 1 (migração + funções).
