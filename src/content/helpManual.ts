import {
  LayoutDashboard, Receipt, Boxes, Users, DollarSign, CreditCard, Wallet,
  Wrench, BarChart3, Tags, ShieldCheck, ShoppingCart, Hammer, Smartphone,
  AlertTriangle, Bell, Settings, Building2, FileSearch, LifeBuoy,
  ArrowRightLeft, type LucideIcon,
} from "lucide-react";

export type HelpStep = { title: string; detail: string };
export type HelpFaq = { q: string; a: string };

export type HelpModule = {
  id: string;                 // slug estável (usado no query param ?modulo=)
  title: string;
  icon: LucideIcon;
  routes: string[];           // rotas cobertas por este módulo
  whatIs: string;             // 2-3 frases
  steps: HelpStep[];          // passo a passo, tarefas principais
  tips?: string[];
  faq?: HelpFaq[];
};

export const HELP_MODULES: HelpModule[] = [
  {
    id: "dashboard",
    title: "Visão geral (Dashboard)",
    icon: LayoutDashboard,
    routes: ["/painel"],
    whatIs:
      "Painel inicial da loja. Reúne faturamento, caixa, margem, alertas e os principais rankings do período selecionado.",
    steps: [
      { title: "Escolher o período", detail: "Use os botões de período no topo (hoje, 7 dias, 30 dias, mês). Todos os cards e gráficos se ajustam." },
      { title: "Entender cada card", detail: "Faturamento é o total vendido (bruto). Recebido em caixa é só o que entrou de fato na data (dinheiro, PIX, cartão, abatimento de crediário). Margem é lucro sobre faturamento. Lucro líquido desconta despesas do período. Estoque encalhado destaca produtos parados." },
      { title: "Abrir os detalhes", detail: "Os cards 'A receber (crediário)', 'Contas a pagar' e 'Alertas' são clicáveis e levam direto para a tela correspondente já filtrada." },
      { title: "Ler os gráficos", detail: "'Evolução das vendas' compara faturamento e ticket médio dia a dia. 'Formas de pagamento' mostra a distribuição entre dinheiro, cartão, PIX, crediário e vale-troca." },
    ],
    tips: [
      "OS em andamento não conta como lucro — só entra no resultado quando fechada e paga.",
      "Se algum número parecer estranho, use a tela de conferência (link no rodapé do dashboard) para bater com SELECTs manuais.",
    ],
    faq: [
      { q: "Por que faturamento e caixa são diferentes?", a: "Faturamento soma vendas pelo valor total do dia da venda; caixa soma só o que foi recebido em dinheiro/cartão/PIX naquela data. Uma venda no crediário aparece em faturamento hoje, mas só cai no caixa quando a parcela for recebida." },
    ],
  },
  {
    id: "vendas",
    title: "Vendas (PDV)",
    icon: Receipt,
    routes: ["/painel/vendas", "/painel/vendas/nova"],
    whatIs:
      "Lista todas as vendas da loja e é a porta de entrada do PDV. Aqui você lança venda nova, aplica desconto, aceita várias formas de pagamento, aparelho na troca e crediário.",
    steps: [
      { title: "Abrir uma venda nova", detail: "Clique em 'Nova venda' no topo. Selecione o cliente (ou marque como avulso) e o tipo de tabela (Padrão / Atacado)." },
      { title: "Adicionar itens", detail: "Use a busca 'Buscar por nome, SKU, EAN, categoria, marca ou modelo…'. O sistema alerta se o estoque está no zero ou negativo." },
      { title: "Aplicar desconto", detail: "Ajuste o desconto em cada item ou no total. O valor unitário permanece bruto e o desconto entra em 'discount_amount' — a soma dos pagamentos precisa fechar com o total líquido." },
      { title: "Escolher a forma de pagamento", detail: "No bloco 'Formas de pagamento' você pode combinar dinheiro, PIX, cartão, boleto, aparelho na troca (trade-in) e crediário. O botão 'Preencher restante' completa o valor que falta." },
      { title: "Venda com aparelho na troca", detail: "Selecione 'Aparelho na troca', escolha o trade-in avaliado (ou cadastre um novo em Estoque → Compra e Troca) e informe o valor. O valor do aparelho vira forma de pagamento — sem gerar despesa." },
      { title: "Venda no crediário", detail: "Escolha 'Crediário', informe entrada (opcional), nº de parcelas, data do 1º vencimento e intervalo (padrão 30 dias). O cliente precisa ter WhatsApp cadastrado. As parcelas são geradas na mesma transação." },
      { title: "Vale-troca", detail: "Se o cliente tem crédito de devolução, use 'Vale-troca' e digite o código (formato VT-XXXXX). Clique 'Validar' para confirmar saldo antes de finalizar." },
      { title: "Finalizar", detail: "Confira o resumo financeiro no rodapé. Ao concluir, o estoque é baixado, o caixa é atualizado e o comprovante fica pronto para impressão." },
    ],
    tips: [
      "Na listagem de vendas o filtro 'Todos pagamentos' vira 'Todas' quando você quer ver tudo. Vencidas aparecem destacadas em vermelho.",
      "Ícones da linha: '$' ajusta valor líquido (taxa de cartão), balão do WhatsApp envia lembrete, ✓ marca como pago, impressora reimprime comprovante.",
    ],
    faq: [
      { q: "Posso combinar formas de pagamento?", a: "Sim. Ex.: R$ 500 no PIX + R$ 300 no crediário em 3x. A soma precisa bater com o total líquido, senão o botão de finalizar fica bloqueado." },
      { q: "Como fazer devolução?", a: "Abra a venda na lista e use o botão de devolução. O estoque volta, o caixa é estornado e o cliente recebe um vale-troca com código VT-XXXXX." },
    ],
  },
  {
    id: "estoque",
    title: "Estoque",
    icon: Boxes,
    routes: ["/painel/estoque", "/painel/estoque/novo", "/painel/estoque/relatorios", "/painel/ajustes-estoque"],
    whatIs:
      "Cadastro de produtos, controle de saldo, entradas manuais, ajustes e marcas. É a base do PDV, das Ordens de Serviço e dos Relatórios.",
    steps: [
      { title: "Cadastrar produto novo", detail: "Clique em '+ Novo produto'. Preencha nome, marca, categoria, preço de venda, custo, estoque atual e mínimo. O SKU é gerado automaticamente se você deixar em branco." },
      { title: "Buscar e filtrar", detail: "Use 'Buscar por nome, SKU ou marca…' e os filtros de Marca e Categoria. A seleção múltipla libera ações em lote (alterar categoria/marca/fornecedor, atualizar preço, atualizar estoque mínimo)." },
      { title: "Registrar aparelho usado (trade-in)", detail: "O botão 'Registrar entrada de aparelho usado (Compra e Troca)' leva ao módulo de Compra e Troca já preparado para cadastrar o aparelho recebido." },
      { title: "Ajustar estoque manualmente", detail: "Em 'Ajustes' você lança perdas, brindes, uso interno ou correções. Toda alteração exige justificativa e vai para aprovação do gestor — fica registrada nos Logs." },
      { title: "Importar / exportar CSV", detail: "'Exportar estoque em CSV' baixa a lista atual. 'Importar produtos via CSV' cadastra em lote — siga o modelo do próprio botão para evitar erros de coluna." },
      { title: "Marcas", detail: "'Marcas que você trabalha' define quais marcas aparecem nos filtros e nas Tabelas de Preço." },
    ],
    tips: [
      "Estoque atual ≤ mínimo → o produto entra automaticamente nas sugestões de Pedido de Compra e gera alerta.",
      "Produtos sem preço de venda são bloqueados no PDV — cadastre o preço antes de tentar vender.",
    ],
  },
  {
    id: "estoque-relatorios",
    title: "Relatório de Estoque",
    icon: BarChart3,
    routes: ["/painel/estoque/relatorios", "/painel/estoque/relatorio", "/painel/estoque/auditoria-pdf"],
    whatIs:
      "Visão consolidada do estoque em tempo real: saldo, movimentação por dia, giro, mais vendidos e sugestões de compra.",
    steps: [
      { title: "Filtrar", detail: "Combine período (mês atual ou personalizado), marca, categoria, fornecedor e busca por texto." },
      { title: "Ver movimentação", detail: "'Movimentação por dia' lista entradas e saídas com data, tipo e valor. Divergências ficam destacadas." },
      { title: "Exportar auditoria em PDF", detail: "A rota /painel/estoque/auditoria-pdf gera um PDF pronto para o contador." },
    ],
  },
  {
    id: "compras",
    title: "Compras (entradas de mercadoria)",
    icon: ShoppingCart,
    routes: ["/painel/compras"],
    whatIs:
      "Registro das notas/compras recebidas. Cada compra soma ao estoque, atualiza o custo médio e alimenta o financeiro.",
    steps: [
      { title: "Registrar nova compra", detail: "'Registrar primeira compra' (ou o botão + no topo) abre o formulário. Escolha o fornecedor (pode ser novo), forma de pagamento e previsão." },
      { title: "Adicionar itens", detail: "'Adicionar item' inclui uma linha; 'Adicionar em lote' aceita várias linhas coladas no formato nome;qtd;custo. Produtos novos são criados automaticamente com o selo 'Novo produto'." },
      { title: "Marcar como recebido", detail: "Na listagem, o botão 'Marcar como recebido' baixa a entrada no estoque com a data de recebimento." },
      { title: "Editar compra fechada", detail: "'Editar compra' recalcula o estoque por DELTA (diferença) e grava auditoria. Só quem tem permissão vê o botão." },
      { title: "Detalhe / link compartilhável", detail: "Clique em qualquer linha para abrir /compras/:id — URL própria para enviar por WhatsApp/e-mail." },
    ],
  },
  {
    id: "pedidos",
    title: "Pedidos de compra",
    icon: ShoppingCart,
    routes: ["/painel/pedidos", "/painel/pedidos/novo"],
    whatIs:
      "Pedido enviado ao fornecedor antes da mercadoria chegar. Vira uma compra quando você recebe.",
    steps: [
      { title: "Novo pedido", detail: "'/painel/pedidos/novo' já sugere itens com estoque abaixo do mínimo, calculando a quantidade com base no histórico." },
      { title: "Editar", detail: "Use o ícone 'Editar pedido' na listagem. Ajuste itens, previsão e observações." },
    ],
  },
  {
    id: "curva-abc",
    title: "Curva ABC & Regra 80/20",
    icon: BarChart3,
    routes: ["/painel/curva-abc"],
    whatIs:
      "Classifica os produtos por giro: A (top faturamento), B (médio), C (baixo). Ajuda a focar compras e negociação nos itens que realmente geram resultado.",
    steps: [
      { title: "Ler o ranking", detail: "Alterne entre 'Mais vendidos', 'Maiores margens' e 'Maiores lucros'. As colunas Classe, Giro e Estoque mostram a saúde do item." },
      { title: "Sugestão de compra inteligente", detail: "O bloco 'Sugestão de compra inteligente' calcula quanto comprar de cada produto e o investimento estimado. Envie o carrinho direto para um Pedido de Compra." },
    ],
  },
  {
    id: "pecas",
    title: "Peças e ferramentas",
    icon: Hammer,
    routes: ["/painel/pecas", "/painel/pecas/vendas"],
    whatIs:
      "Estoque separado de peças (telas, baterias, flex, etc.) e ferramentas usadas na assistência. Sincroniza com as Ordens de Serviço.",
    steps: [
      { title: "Cadastrar peça", detail: "Preencha nome, marca, modelos compatíveis, estoque atual/mínimo, custo, preço de venda, fornecedor e localização (ex.: 'Gaveta A2')." },
      { title: "Lançar em OS", detail: "Botão 'Lançar em OS' abre uma OS aberta e adiciona a peça — o estoque baixa quando o reparo é finalizado." },
      { title: "Peças utilizadas", detail: "A aba 'Peças utilizadas' mostra o histórico de consumo por OS/técnico." },
      { title: "Centro de compras", detail: "'Centro de compras' é onde você registra a compra da peça (fornecedor, valor, observações) — soma ao estoque na hora." },
    ],
  },
  {
    id: "ordens",
    title: "Ordens de Serviço (Assistência)",
    icon: Wrench,
    routes: ["/painel/ordens", "/painel/ordens/nova"],
    whatIs:
      "Gestão completa do reparo: abertura, checklist, orçamento, aprovação do cliente, execução, garantia e entrega.",
    steps: [
      { title: "Abrir OS", detail: "Preencha 'Dados do cliente', 'Identificação do equipamento' (categoria, armazenamento, sistema, saúde da bateria, acessórios), defeito reclamado e análise técnica." },
      { title: "Senha do aparelho", detail: "O campo aceita senha numérica/texto OU padrão visual 3x3 (início em verde, meio em amarelo, fim em vermelho com setas)." },
      { title: "Orçamento", detail: "Adicione peças (do estoque) e mão de obra. O total aparece automaticamente. Defina prazo e técnico responsável." },
      { title: "Aprovação do cliente", detail: "Use 'Copiar link público de acompanhamento' para enviar o link ao cliente — ele consulta o status e aprova o orçamento sem login." },
      { title: "Assinatura", detail: "O bloco 'Assinatura do cliente' captura a assinatura na entrega, salva no PDF de garantia." },
      { title: "Fila 'Aguardando preparo'", detail: "Antes de concluir o reparo o sistema valida se há peças suficientes. Se faltar, a OS fica em 'Aguardando preparo' e não deixa fechar." },
      { title: "Comissão do técnico", detail: "Se houver regra de comissão cadastrada, o valor é gerado automaticamente ao fechar e estornado se a OS for cancelada." },
    ],
    tips: [
      "Etapas customizáveis são definidas em Configurações → Etapas da OS.",
      "OS paradas por muito tempo geram alerta automático no sino.",
    ],
  },
  {
    id: "relatorios-os",
    title: "Relatórios de OS",
    icon: BarChart3,
    routes: ["/painel/ordens/relatorios"],
    whatIs:
      "Produtividade da assistência: tempo por etapa, ciclo médio, técnico, lucro por OS e comparativo com o período anterior.",
    steps: [
      { title: "Filtrar", detail: "Escolha período, técnico e status. Os filtros ficam salvos no navegador (localStorage)." },
      { title: "Exportar CSV", detail: "Botão de exportação gera CSV com todas as OS do filtro atual." },
    ],
  },
  {
    id: "troca",
    title: "Compra e Troca (Trade-In)",
    icon: Smartphone,
    routes: ["/painel/troca", "/painel/troca/novo", "/painel/troca/reconciliacao"],
    whatIs:
      "Cadastro de aparelhos usados recebidos do cliente — para revenda ou como forma de pagamento em outra venda. Fica dentro de Estoque (não gera despesa automática).",
    steps: [
      { title: "Registrar entrada", detail: "'/painel/troca/novo' abre a ficha: cliente, aparelho, marca, modelo, IMEI, condição, valor de entrada e observações." },
      { title: "Preparar para venda", detail: "Na tela do aparelho, use 'Completar ficha' e depois 'Confirmar preparo'. Adicione peças do estoque e custos manuais — o total estimado atualiza sozinho." },
      { title: "Status", detail: "Filtre por 'Em estoque', 'Aguardando preparo' ou 'Desativado'. 'Desativar aparelho' pede motivo (perda, devolução, etc.)." },
      { title: "Reconciliação", detail: "'/painel/troca/reconciliacao' bate o estoque físico com o sistema — útil no fechamento mensal." },
      { title: "Usar como pagamento", detail: "No PDV, forma de pagamento 'Aparelho na troca' consome um trade-in em estoque. O custo do produto é sincronizado automaticamente." },
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
    icon: Users,
    routes: ["/painel/clientes"],
    whatIs:
      "Cadastro de clientes com histórico de compras, WhatsApp para contato e dados fiscais.",
    steps: [
      { title: "Cadastrar", detail: "Preencha nome, CPF/CNPJ, contato (telefone e WhatsApp) e endereço. CPF/CNPJ é único por loja — se já existir, o sistema oferece abrir o cadastro." },
      { title: "Enviar mensagem", detail: "Botão 'Enviar mensagem' abre o WhatsApp com o número já preenchido." },
      { title: "Copiar número", detail: "Copia o WhatsApp para a área de transferência." },
    ],
  },
  {
    id: "fornecedores",
    title: "Fornecedores",
    icon: Users,
    routes: ["/painel/fornecedores"],
    whatIs:
      "Cadastro de fornecedores com histórico de compras, valor comprado e representante.",
    steps: [
      { title: "Cadastrar", detail: "Empresa, representante, CNPJ, marcas trabalhadas, cidade, condições de pagamento (ex.: 30/60/90) e observações." },
      { title: "Ativos vs inativos", detail: "O switch 'Fornecedor ativo' controla se aparece nas listas de compra." },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    icon: DollarSign,
    routes: ["/painel/financeiro"],
    whatIs:
      "Central de recebimentos, contas a pagar e resultado. Consolida vendas, crediário, despesas e comissões.",
    steps: [
      { title: "Ler os totais", detail: "'Pago', 'Vencido', 'Em aberto' resumem a situação do período. Os cards 'A receber' e 'Contas a pagar' abrem listagens filtradas." },
      { title: "Reordenar cards", detail: "Botão 'Reordenar cards' deixa você arrastar e salvar a ordem preferida." },
      { title: "Recebimentos por método", detail: "Gráfico que mostra quanto entrou por dinheiro, PIX, cartão, etc." },
      { title: "Despesas rápidas", detail: "Bloco 'Despesas e contas a pagar' → 'Lançar nova despesa' cria um lançamento sem sair da tela." },
    ],
  },
  {
    id: "crediario",
    title: "Crediário (A receber)",
    icon: CreditCard,
    routes: ["/painel/crediario"],
    whatIs:
      "Gestão de vendas parceladas em casa: parcelas com vencimento, recebimento parcial ou total, renegociação e cobrança educada via WhatsApp.",
    steps: [
      { title: "Filtrar", detail: "Abas: Em aberto, Vence hoje, Vencidas (em vermelho com dias de atraso), Pagas. Busca por cliente ou WhatsApp." },
      { title: "Receber parcela", detail: "Botão 'Receber' abre o diálogo com o saldo pré-preenchido. Aceita valor parcial. Escolha a forma (Dinheiro, Cartão, Transferência, Outro) e a data. Cada abatimento é ENTRADA DE CAIXA na data do recebimento." },
      { title: "Cobrar via WhatsApp", detail: "Ícone de WhatsApp em cada parcela abre wa.me com mensagem educada renderizada do template 'cobranca_pendente' (ou 'cobranca_vencida' se vencida). Edite os templates em Configurações → Mensagens WhatsApp." },
      { title: "Editar vencimento", detail: "'Editar vencimento' altera a data sem apagar histórico. A ação fica registrada em auditoria." },
      { title: "Renegociar saldo", detail: "'Renegociar saldo desta venda' quita as parcelas restantes e gera novas parcelas com novas datas." },
    ],
    faq: [
      { q: "Cliente pagou uma parte, como registro?", a: "Clique em 'Receber', digite o valor pago (menor que o saldo) e confirme. A parcela vira 'parcial' e o restante continua em aberto." },
      { q: "A parcela paga aparece no caixa de quando?", a: "Do dia do recebimento (não do dia da venda). É por isso que o 'Recebido em caixa' do dashboard bate certinho." },
    ],
  },
  {
    id: "despesas",
    title: "Custos & Despesas",
    icon: Wallet,
    routes: ["/painel/despesas"],
    whatIs:
      "Todos os custos fixos e variáveis da loja. Alimentam o lucro líquido do dashboard.",
    steps: [
      { title: "Lançar despesa", detail: "Preencha data, categoria, subcategoria, descrição, valor, forma de pagamento e centro de custo. Marque 'Paga' ou 'Em aberto'." },
      { title: "Categorias", detail: "Aba 'Categorias' + 'Nova categoria' cria categorias e subcategorias com o tipo (fixa/variável)." },
      { title: "Relatórios", detail: "Gráficos 'Gastos por categoria', 'Evolução mensal' e 'Ranking das maiores despesas'. Exporta em Excel." },
    ],
  },
  {
    id: "comissoes",
    title: "Comissões",
    icon: Wallet,
    routes: ["/painel/comissoes"],
    whatIs:
      "Ledger de comissões de vendedores (vendas) e técnicos (OS). Gerado automaticamente por regra e estornado quando a venda/OS é cancelada.",
    steps: [
      { title: "Filtrar", detail: "Filtros de período (Até), Pessoa, Origem (Venda/OS) e Status (A pagar, Pago, Estornado)." },
      { title: "Pagar em lote", detail: "'Selecionar pendentes' marca todos os itens 'A pagar' do filtro. O botão de pagamento cria uma despesa única com os selecionados." },
      { title: "Cadastrar regras", detail: "Em Configurações → Comissões: percentual ou valor fixo, por vendedor/técnico, com regras diferentes para venda e OS." },
    ],
  },
  {
    id: "tabelas",
    title: "Tabelas de Preço",
    icon: Tags,
    routes: ["/painel/tabelas"],
    whatIs:
      "Catálogo público filtrado por marca/categoria para enviar ao cliente. Exporta em PDF ou compartilha por link.",
    steps: [
      { title: "Filtrar", detail: "Escolha categorias e marcas. Busca por Nome / Código (SKU) e por Disponibilidade." },
      { title: "Exportar", detail: "Gera PDF pronto para WhatsApp com preços atualizados." },
    ],
  },
  {
    id: "garantias",
    title: "Garantias",
    icon: ShieldCheck,
    routes: ["/painel/garantias"],
    whatIs:
      "Consulta e reimpressão de garantias emitidas em vendas e OS.",
    steps: [
      { title: "Buscar", detail: "Filtre por cliente, aparelho, período ou nº da venda/OS." },
      { title: "Reimprimir", detail: "Botão de impressão gera o PDF de garantia com os dados originais." },
    ],
  },
  {
    id: "alertas",
    title: "Central de Alertas",
    icon: AlertTriangle,
    routes: ["/painel/alertas"],
    whatIs:
      "Situações que precisam da sua atenção agora: estoque negativo, ajustes pendentes de aprovação, OS paradas, crediário vencido, produtos sem preço.",
    steps: [
      { title: "Verificar agora", detail: "Botão 'Verificar agora' força uma nova checagem no banco." },
      { title: "Abrir detalhe", detail: "Cada alerta tem um link 'Abrir detalhe' que leva direto à origem do problema." },
    ],
  },
  {
    id: "notificacoes",
    title: "Notificações",
    icon: Bell,
    routes: ["/painel/notificacoes"],
    whatIs:
      "Feed de eventos gerais do sistema (novas vendas, OS atualizadas, mensagens do suporte). Diferente dos Alertas, aqui é informação — não requer ação imediata.",
    steps: [
      { title: "Marcar como lida", detail: "Ao entrar na tela, as notificações novas são consideradas vistas e a bolinha vermelha do menu some." },
    ],
  },
  {
    id: "logs",
    title: "Logs",
    icon: FileSearch,
    routes: ["/painel/logs"],
    whatIs:
      "Histórico de ações críticas: quem editou uma venda, aprovou um ajuste de estoque, mudou o custo de um produto. Somente Dono e Admin Master.",
    steps: [
      { title: "Filtrar", detail: "Filtros por usuário, tipo de ação e período." },
    ],
  },
  {
    id: "lojas",
    title: "Minhas Lojas (multi-loja)",
    icon: Building2,
    routes: ["/painel/lojas", "/painel/estoque/transferencia"],
    whatIs:
      "Gestão de mais de uma loja no mesmo cadastro. Cada loja tem estoque, financeiro e usuários próprios.",
    steps: [
      { title: "Trocar de loja", detail: "Use o seletor no topo do menu lateral (StoreSwitcher). A loja ativa aparece com o selo 'Ativa agora'." },
      { title: "Adicionar loja", detail: "'Adicionar nova loja' cobra o valor da loja adicional conforme seu plano (boleto ou cartão)." },
      { title: "Transferência entre lojas", detail: "'Abrir transferência' move produtos entre lojas com registro nos Logs das duas pontas." },
    ],
  },
  {
    id: "usuarios",
    title: "Usuários e Cargos",
    icon: Users,
    routes: ["/painel/usuarios", "/painel/cargos"],
    whatIs:
      "Convida colaboradores, define cargo (Dono, Gerente, Vendedor, Técnico) e o que cada um pode fazer.",
    steps: [
      { title: "Convidar", detail: "Informe e-mail e cargo. O convidado recebe o link para criar a senha." },
      { title: "Editar permissões", detail: "Dono e Gerente editam vendas e compras por padrão. Botões de exclusão (DELETE) ficam ocultos para quem não tem permissão." },
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações",
    icon: Settings,
    routes: ["/painel/configuracoes"],
    whatIs:
      "Dados da loja, aparência, políticas de estoque, mensagens de WhatsApp, comissões e usuários.",
    steps: [
      { title: "Dados da loja", detail: "Logotipo, nome fantasia, razão social, Instagram, telefone, endereço. Ative 'Exibir razão social nas notas' se emite nota fiscal." },
      { title: "Aparência", detail: "Tema (claro/escuro), tamanho da fonte e texto institucional que aparece em pedidos e garantia." },
      { title: "Estoque", detail: "Switch 'Permitir venda com estoque negativo' libera a venda mesmo sem saldo (para casos específicos)." },
      { title: "Mensagens WhatsApp", detail: "Edite os templates: comprovante, lembrete de OS, cobrança pendente, cobrança vencida. Use variáveis {cliente}, {loja}, {valor}, {vencimento}, etc." },
      { title: "Etapas da OS", detail: "Crie/renomeie/reordene as etapas do fluxo de assistência." },
      { title: "Comissões", detail: "Cadastre regras por pessoa e por origem (venda/OS)." },
    ],
  },
  {
    id: "suporte",
    title: "Suporte e Central de Ajuda",
    icon: LifeBuoy,
    routes: ["/painel/suporte"],
    whatIs:
      "Onde você está agora. Manual completo do sistema, canal direto com nossa equipe e envio de sugestões/bugs com anexos.",
    steps: [
      { title: "Central de ajuda", detail: "Busque por módulo ou palavra-chave (ex.: 'troca', 'crediário'). Todo módulo tem 'O que é', passo a passo, dicas e perguntas frequentes." },
      { title: "Abrir chamado", detail: "Aba 'Abrir chamado' + templates prontos (Bug, Ajuste, Melhoria) que preenchem o formulário com os campos que o suporte precisa." },
      { title: "Sugestões & Bugs", detail: "Botão no topo abre diálogo rápido com anexo de até 5 arquivos (10MB cada)." },
      { title: "Ícone '?' global", detail: "No topo de qualquer tela, o botão HelpCircle abre a Central de Ajuda no módulo daquela tela." },
    ],
  },
];

// Mapeia URL -> id do módulo (usado pelo botão '?' global)
export function moduleIdForPath(pathname: string): string | null {
  // rota mais específica primeiro
  const sorted = [...HELP_MODULES].sort(
    (a, b) =>
      Math.max(...b.routes.map((r) => r.length)) -
      Math.max(...a.routes.map((r) => r.length)),
  );
  for (const m of sorted) {
    for (const r of m.routes) {
      if (pathname === r || pathname.startsWith(r + "/")) return m.id;
    }
  }
  return null;
}

export function helpHrefForPath(pathname: string): string {
  const id = moduleIdForPath(pathname);
  const qs = id ? `?tab=ajuda&modulo=${id}` : `?tab=ajuda`;
  return `/painel/suporte${qs}`;
}

export function helpHrefForModule(id: string): string {
  return `/painel/suporte?tab=ajuda&modulo=${id}`;
}