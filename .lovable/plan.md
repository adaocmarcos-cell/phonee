## Objetivo
Transformar o Meta Pixel já instalado em um sistema completo de tracking para vender mais assinaturas Phonee: eventos certos disparados nas páginas de venda, envio em paralelo via Meta Conversions API (CAPI) para resistir a bloqueadores, controle de consentimento de cookies (LGPD-friendly), painel de monitoramento no admin master e modo debug.

## 1. Eventos do Pixel (frontend)
Disparar eventos padrão Meta nas páginas de venda, ao invés de só `PageView`:
- `ViewContent` — entrada em `/comprar`, `/?demo=1`, `/testegratis` (com `content_name` do plano)
- `Lead` — submissão de "Experimente grátis 7 dias" e "Indique e ganhe"
- `InitiateCheckout` — clique no botão de assinar plano (anual / vitalício / trial)
- `Purchase` — confirmação em `/comprar/sucesso` (com `value` e `currency=BRL`)
- `CompleteRegistration` — cadastro de parceiro / signup

Helper único `src/lib/metaPixel.ts` com `track(event, params)` que gera um `event_id` (UUID) por evento — necessário para deduplicar com o envio via CAPI.

## 2. Consentimento de cookies (LGPD)
- Novo componente `CookieConsentBanner.tsx`, exibido no rodapé na primeira visita de páginas públicas.
- Opções: **Aceitar** / **Apenas essenciais**. Estado salvo em `localStorage` (`phn_consent=granted|denied`).
- `MetaPixel.tsx` passa a só carregar o script e disparar eventos quando `consent === granted`. Se o usuário aceitar depois, o pixel inicializa em runtime sem reload.
- Botão "Preferências de cookies" no rodapé do site para reabrir o banner.

## 3. Meta Conversions API (CAPI) — servidor
- Nova edge function `meta-capi-track` que recebe `{ event_name, event_id, event_source_url, user_data, custom_data }`, hash SHA-256 de email/telefone, e faz POST para `https://graph.facebook.com/v18.0/<PIXEL_ID>/events` usando o **access token** do Meta (secret).
- Todo evento disparado no front também é enviado em paralelo para essa função com o mesmo `event_id` — Meta usa o ID para deduplicar Pixel + CAPI.
- Cada chamada grava uma linha em `meta_pixel_events` (tabela nova) para o painel admin.

## 4. Painel admin master — Marketing → Meta Pixel
Em `src/pages/phonee/Marketing.tsx`, nova aba "Meta Pixel" com:
- **KPIs últimos 30 dias**: total de eventos, eventos por tipo, taxa CAPI vs Pixel, conversões (Lead/Purchase), valor total.
- **Gráfico diário** de eventos por tipo (Recharts).
- **Top páginas** que mais geraram eventos.
- **Tabela de últimos 50 eventos** com tipo, origem (browser/server), página, valor, status do envio CAPI.
- Botões de configuração: Pixel ID (já existe), **Access Token CAPI** (secret), **Test Event Code** (opcional para debug Meta).

## 5. Painel de debug
- Aba "Debug" dentro do mesmo módulo: campo para colar o **Test Event Code** do Meta Events Manager.
- Quando preenchido, o front anexa esse código em `fbq('track', ...)` (via `fbq('set', 'agent', ...)` não — usa o parâmetro `test_event_code` na chamada CAPI) e o backend também envia para CAPI.
- Stream em tempo real (polling 3s) dos últimos eventos disparados pela sessão atual, mostrando se chegou no Pixel, no CAPI, e o response do Meta.

## 6. Validação do filtro de preço
Já foi entregue na rodada anterior (bordas vermelhas + mensagem clara quando "De" > "Até") em `TabelasPreco.tsx`. Vou apenas reconferir a UX e ajustar a mensagem se necessário.

## Detalhes técnicos
- **Tabela nova** `meta_pixel_events`: `event_name`, `event_id` (UUID), `source` (`browser`|`server`), `event_source_url`, `value`, `currency`, `email_hash`, `phone_hash`, `fbp`, `fbc`, `user_agent`, `ip`, `capi_status`, `capi_response`, `test_event_code`, `created_at`. RLS: apenas `admin_master` lê; insert via service role (edge function).
- **RPC** `phonee_pixel_events_overview(_days int)` retorna KPIs/series/top paths/last 50 — restrita a `is_admin_master`.
- **Secret necessário**: `META_CAPI_ACCESS_TOKEN` (System User access token do Meta Business com permissão no dataset do pixel). Antes de criar a edge function, vou pedir confirmação para você gerar e colar via formulário seguro do Lovable (passo a passo: Meta Business → Configurações do Evento → seu Pixel → Configurações → "Gerar token de acesso"). Sem esse token a parte CAPI fica desativada, mas todo o resto (Pixel, consentimento, painel, debug) funciona.
- O Pixel ID `1545906780399824` já está salvo em `marketing_settings` e exposto via `get_meta_pixel_id()`.

## Arquivos afetados
- `src/lib/metaPixel.ts` (novo helper de tracking)
- `src/components/MetaPixel.tsx` (consent gating + event_id + CAPI dispatch)
- `src/components/CookieConsentBanner.tsx` (novo)
- `src/pages/Landing.tsx`, `src/pages/Comprar.tsx`, `src/pages/ComprarSucesso.tsx`, `src/components/FreeTrialSignupDialog.tsx`, `src/components/LandingReferralSignupDialog.tsx`, `src/pages/ParceirosSignup.tsx` (chamadas `track()`)
- `src/pages/phonee/Marketing.tsx` (abas + KPIs + debug)
- `supabase/functions/meta-capi-track/index.ts` (nova edge function)
- Migration: tabela `meta_pixel_events`, RPC `phonee_pixel_events_overview`

## Confirmação
Confirma que posso seguir com este escopo? E me autoriza a já solicitar o **META_CAPI_ACCESS_TOKEN** para ativar o envio server-side? (sem ele, só Pixel + painel + consentimento funcionam — o CAPI fica pronto mas inativo).
