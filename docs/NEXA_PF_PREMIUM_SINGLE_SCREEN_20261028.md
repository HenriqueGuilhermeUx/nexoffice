# Nexa PF Private — experiência unificada premium (28/10/2026)

## Decisão: UMA visão, vários serviços
A entrada autenticada da Nexa PF passa a ser `Visão completa`, em `NexaPremiumDashboard.tsx`, mantendo os módulos originais acessíveis sem reconstruí-los. A marca é Nexa com o azul-marinho, azul e ciano existentes. Navegação por áreas é **aprofundamento** da mesma experiência; não será necessário ter logins financeiros adicionais dentro da PF para organizar dados já autorizados.

O dashboard apresenta contas e movimentações do Nex Finance Core, metas, orçamento, patrimônio e dívidas declaradas, vencimentos, Maya e especialistas, F-Insight, navegação para Nexa Wallet/Privy e carteiras externas, além de atalhos de serviços pessoais: documentos, contratos, agenda/jornadas, compras, dívida e direitos. Reaproveita endpoints de PF existentes e evita importar ERP/CRM empresarial inteiro para a PF.

## Fonte da verdade / anti-double-count
- `GET /v1/personal/overview`: apenas o agregado de contas BRL conectadas e atualizadas **quando todas** estão cobertas. Se incompleto, `null` e "—", nunca R$ 0 ou soma parcial.
- `GET /v1/personal/accounts`: contas manuais e de provedor com proveniência, horário e `fresh`. Um registro declarado não vira saldo verificado pela interface.
- `GET /v1/personal/transactions`: movimentações vinculadas ao titular; não são ordens nem autorizações de pagamento.
- `GET /v1/personal/studio`: orçamentos, metas, ativos/dívidas **declarados**, compromissos e insights; patrimônio declarado nunca é somado automaticamente com saldos Open Finance/Wallet, pois pode haver dupla contagem.
- `GET /v1/personal/providers`: status e `connectEnabled` são informativos. **Não iniciar OAuth** até que callback, consentimento e integração homologados estejam ativos no servidor.
- `GET /v1/personal/life`: prioridades e jornadas, sem puxar dados sensíveis de outros produtos.
- `GET /v1/personal/consents`: consentimentos informados pelo backend, sem presumir identidade, extensão de escopo ou validade de terceiros.
- `NexaCryptoHub`: handoff explícito à Wallet original autenticada, **sem bearer token PF**, sem se passar pelo Privy e sem assinar transações.

## Contratos preparados para conectores
O código reaproveita `packages/integrations/src/nex-finance-core.ts`: `OpenFinanceProvider` tem escopos accounts, balances, transactions, cards, credit e investments; `PaymentInitiationProvider` define preparar/confirmar Pix. As implementações Belvo e Efí ainda lançam `ProviderNotConfiguredError`. Para qualquer serviço:
1. **Descoberta**: verificação de conta e habilitação do escopo com o parceiro, sem anunciar suportes que não existem.
2. **Consentimento**: conectar a conta com finalidade específica, autorização do titular, estado, expiração, revogação e auditabilidade; token do parceiro apenas no servidor.
3. **Ingestão**: webhooks assinados/validados, idempotência, tentativas, deduplicação, e reconciliação. Guardar proveniência: provedor, instrumento, moeda, data da posição, qualidade, categorias e titularidade.
4. **Normalização**: contas, investimentos, cartão, dívidas e empréstimos em tabelas de leitura PF por owner, mantendo ativos declarados separados de dados bancários e separando instrumentos/identificadores. O cliente escolhe o que quer exibir.
5. **Carteira Nexa/Privy**: vinculação PF↔Wallet **apenas com autenticações independentes e consentimento explícito**, mecanismo de troca de uso único curta duração e escopos de leitura separados. Nunca compartilhar token de sessão nem chaves privadas.
6. **MetaMask / WalletConnect**: conectar a partir do módulo autenticado da Wallet, com verificação de chain e endereço; provedores e saldos somente após autorização, sem receber seed phrase ou chave privada.
7. **Agentics**: Maya pode preparar uma intenção, consultar dados PF autorizados e gerar plano **sem executar**. Para pagamentos, crédito, swap, ordens e assinaturas exigir verificação de elegibilidade, limite, destinatário, taxas/CET, idempotência, autenticação reforçada, aprovação humana expressa, antifraude, reconciliação e kill switch. Nada disso está ativo na prévia.

## Reuso selecionado de NexOffices para PF
- Financeiro: análise, categorização, extratos, orçamentos e relatórios pessoais.
- Agenda e tarefas: lembretes e jornadas, sem copiar tarefas de workspaces PJ.
- Documentos, contratos e assinatura: checklist já acessível; integração DocWallet requer sessão/consentimento separados.
- Agentes e automações: políticas e coordenação Maya para PF, com permissões do usuário.
- Compras, propostas, oportunidades e crédito: comparação imparcial e transparente, sem financiamento ou oferta sem parceiro verificado.
- Saúde, educação e família: apenas por consentimento próprio e isolamento; não usar dados clínicos ou de menores para marketing, crédito ou Agentics financeiro.

## Camadas de produto
**Disponível na beta (branch PF):** visão unificada read-only, dados manuais, importação de extratos, metas, vencimentos, patrimônio declarado, Maya como roteador, pesquisa F-Insight, atalhos ao portal Wallet e ferramentas pessoais já existentes.

**Em homologação:** Open Finance real, dados bancários de investimentos/cartões/crédito, portal de Wallet Connect, link PF↔Privy, read-only wallet on-chain, integrações com assinatura/agenda, Agentics com consultas autenticadas por escopo. Nenhuma delas é ativada por essa interface.

**Somente após autorizações:** iniciação Pix/transferências, ordens, garantias de cripto ou ações tokenizadas, crédito, execução de ações de agentes. A tela não é banco, instituição depositária ou promessa de conta bancária, produto financeiro ou investimento.

## Gate de publicação
Esta PR é filha da PR #86 (PF beta), DRAFT, não modifica `main` de NexOffices PJ, nem Wallet, Render/Neon/Netlify de produção. Antes de integrar na beta, CI build/integration verde, smoke de proveniência, revisão de UX e confirmação de que nenhuma credencial PF é passada a outra origem. A beta segue isolada e por convite. **Produção PF** continua NO-GO pela revisão de RLS, auth e banco exclusivo das PRs #103 e #106.

## Testes
`node --experimental-strip-types --test scripts/smoke-nexa-pf-premium-command.mjs` checa zero fictício, conta conectada completa vs. cobertura parcial, separação de declarações e saldo verificado, ausência de saldo Wallet simulado e uso somente de contratos PF. `npm run build` e CI de integração comprovam a regressão dos módulos existentes.

## Endereços
- PF marca: https://trynexa.com.br/
- Beta PF: serviço Render isolado `nex-personal-preview-api` por convite
- Wallet original atual: https://trynexa.com.br/portal/ ; criação de conta: https://trynexa.com.br/cadastro
- `wallet.trynexa.com.br` é destino arquitetural futuro, **não presume publicação ou equivalência de sessão**.
