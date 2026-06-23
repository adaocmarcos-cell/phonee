## Objetivo
Adicionar um botão "Ver demonstração" na página de vendas (Landing) que abre o painel real do Phonee com dados fictícios, totalmente navegável pelo lead. Apenas a página de Configurações fica em modo somente-leitura.

## Abordagem técnica

O painel atual carrega tudo do banco (Supabase) por loja/usuário autenticado. Para o modo demo, vamos isolar o usuário em uma **loja-demo real e compartilhada** no próprio banco, com dados fictícios já populados. Isso evita reescrever 40+ páginas com mocks e garante que toda a UI funcione de verdade (criar venda, abrir OS, lançar despesa etc.) — só que dentro de uma sandbox que o lead não consegue corromper.

### 1. Botão na Landing
- Adicionar CTA secundário "Ver demonstração" ao lado de "Comprar agora" no header e no hero da `src/pages/Landing.tsx`.
- Clique chama `enterDemoMode()` e navega para `/painel`.

### 2. Modo demo (frontend)
- Novo arquivo `src/lib/demoMode.ts` com:
  - `isDemoMode()` — lê `sessionStorage["phonee.demo"]`
  - `enterDemoMode()` — faz signIn anônimo (ou login fixo em uma conta `demo@phonee.com.br`) e marca a flag
  - `exitDemoMode()` — signOut + limpa flag
- `ProtectedRoute` continua exigindo sessão (mantemos segurança); o demo usa uma conta real `demo@phonee.com.br` com senha pública.
- `AppLayout` exibe banner fixo no topo: "Modo demonstração — dados fictícios. [Sair da demo] [Comprar agora]".

### 3. Página de Configurações somente-leitura no demo
- Em `src/pages/app/Configuracoes.tsx`, ler `isDemoMode()` e:
  - Desabilitar todos os `<Input>`, `<Switch>`, `<Button>` de salvar (props `disabled` + `pointer-events-none` no formulário).
  - Mostrar alerta no topo: "Configurações são apenas para exibição na demonstração."
- Demais páginas permanecem 100% clicáveis.

### 4. Conta e dados demo (backend)
Migration que cria:
- Usuário `demo@phonee.com.br` com senha fixa pública (ex: `demo123456`).
- Loja "Loja Demonstração Phonee" vinculada ao usuário como dono.
- Seed de dados fictícios: ~15 produtos, ~8 clientes, ~20 vendas dos últimos 30 dias, ~5 OS abertas/concluídas, ~6 despesas, 1 fornecedor, 1 tabela de preço.
- **Reset automático**: trigger ou edge function `demo-reset` que, periodicamente (ou a cada login na conta demo), restaura os dados para o estado inicial — evita que leads "sujem" o ambiente.

### 5. Banner / proteções extras
- `AppLayout` esconde o link "Comprar plano" e troca por "Voltar ao site".
- `AdminMasterRoute` e `/phonee/*` continuam bloqueados (demo não vê painel master).

## Arquivos a criar/editar

**Criar**
- `src/lib/demoMode.ts`
- `src/components/layout/DemoBanner.tsx`
- `supabase/migrations/<timestamp>_demo_account.sql` (cria usuário + loja + seed)
- `supabase/functions/demo-reset/index.ts` (limpa e recria dados da loja demo)

**Editar**
- `src/pages/Landing.tsx` — botões "Ver demonstração" no header e hero
- `src/components/layout/AppLayout.tsx` — renderiza `<DemoBanner />` quando `isDemoMode()`
- `src/pages/app/Configuracoes.tsx` — modo somente-leitura

## Pontos de atenção
- Senha do usuário demo será pública (intencional); RLS continua isolando dados por loja, então o lead só vê/edita a loja demo.
- O reset automático é essencial — sem ele, em 1 semana a loja demo vira lixo. Posso rodar o reset toda vez que alguém entra em `/painel` em modo demo (debounced a cada 30 min) ou via cron.
- Cadastro de novos usuários/lojas dentro da demo deve ser bloqueado (botões desabilitados nas páginas Usuários/Lojas).

## Pergunta antes de implementar
Confirma a abordagem de **conta demo real + seed + reset automático**? Ou prefere uma alternativa mais simples sem banco (tudo mockado no frontend, mais leve mas algumas ações como "salvar" não funcionariam de verdade)?
