# F-Insight no Nex Personal — integração PF isolada
Data: 24/10/2026  
Status: código preparado na PR #86, **não homologado visualmente nem publicado**.

## Arquitetura e motivo
O F-Insight continua sendo um produto próprio:
- Frontend: `HenriqueGuilhermeUx/f-insight` (React/Vite, usuário e identidade próprios).
- API: `HenriqueGuilhermeUx/f-insight-api` (pesquisa, macro, dados de mercado, Quant, área de assessores).

O NexOffice PJ já tem bridge `/v1/investments/*` baseada em `workspaceContext(..., 'finance.read')`. **Não** reutilizamos essa autorização para PF. Nex Personal mantém autenticação PF, Neon isolado e nenhuma transferência de dados empresariais, bancários ou do usuário para o F-Insight.

Dentro do escritório pessoal, a sala já existente **Investimentos — Léo** direciona agora à seção **Investimentos & Mercados · F-Insight**; Léo continua com análise de patrimônio declarado e a plataforma F-Insight permanece acessível por link externo claramente identificado (sem SSO ou transferência de credenciais).

## Capacidade disponível no código (feature de homologação, desativada por padrão)
- `GET /v1/personal/finsight/status`: requer sessão PF ativada, consulta local sem contato com F-Insight.
- `GET /v1/personal/finsight/asset/:symbol`: requer sessão PF, símbolo validado; envia **somente o símbolo solicitado** para pesquisa interna do F-Insight. Apenas cotação Finnhub com preço válido e timestamp; sem fallback demonstrativo, ordens ou análise de portfólio.
- `GET /v1/personal/finsight/macro`: requer sessão PF; busca dados informativos do Banco Central via motor do F-Insight e aceita somente as séries 432, 433 e 1, com fonte e data. Ausência de dado não vira número artificial.
- Métodos externos permitidos: somente GET. Não há POST de pagamentos, investimentos, trading, watchlist ou ordens.
- Não há migrações, tabelas novas, integração automática com Nexa Wallet ou compartilhamento de posições/finanças do titular.
- Frontend `apps/web/src/PersonalFInsight.tsx`, API `apps/api/src/routes-nex-personal-finsight.ts`, ligada apenas em `server-personal.ts`.
- Sem conectividade configurada, somente a área informativa e o link separado de F-Insight ficam disponíveis.

## Configuração futura — **não colocar secrets no Git**
No serviço **Render PF isolado** `nex-personal-preview-api`:
- `FINSIGHT_PERSONAL_INTERNAL_URL`: URL HTTPS *base* da API F-Insight, sem caminho/query.
- `FINSIGHT_PERSONAL_INTERNAL_KEY`: credencial privada do endpoint interno do F-Insight, armazenada somente no backend PF; não compartilhar com o cliente web. A API F-Insight espera `FINSIGHT_INTERNAL_API_KEY` no lado dela.
No backend F-Insight, a feature atual depende da flag `INTERNAL_MARKET_TERMINAL_ENABLED=true` e da credencial interna, cuja autorização deve ser revisada antes da ativação, **sem afetar produção existente**. Não configurar ou ativar nenhuma variável sem verificar contrato, logs e autorização de integração. Não copiar indiscriminadamente secrets do bridge PJ.

## Proteção dos dados e qualidade
1. Toda consulta exige autenticação PF e perfil ativo. Nenhum CPF, saldo, transação, watchlist, token PF, empresa ou vínculo de identidade segue para o fornecedor.
2. A pesquisa de ativo e macro só é disparada por clique explícito do usuário; a tela não envia requests de mercado automaticamente.
3. HTTPS obrigatório na configuração e timeouts de 8s; resposta externa passa por allowlist de campos, sem proxy indiscriminado.
4. Sem números fictícios. **Atenção:** módulos legados do F-Insight ainda contêm dados simulados/fallback `BRAZILIAN_STOCKS` e `fallbackMacro` em outros caminhos. Não reutilizá-los nesta integração.
5. Watchlist pessoal sincronizada, alertas com identificação, carteira personalizada, F-Insight Agent contextual e Quant são fases posteriores dependentes de consentimento, controles de fornecedor e termos de uso dos dados.
6. Não inferir recomendação de investimento; mostrar fonte e timestamp; respeitar limites de licenciamento e redistribuição de cotações.

## Critérios de homologação
- CI no HEAD **exato** aprovado, inclusive novo `scripts/smoke-nex-personal-finsight.mjs` e testes do preview.
- Testes negativos 401 anônimo, 409 conector desativado, 400 ticker inválido; nenhum contato externo quando desativado.
- Testar com serviço/credencial interna **não produtivos ou somente leitura**, documentando disponibilidade real e falhas de provedor sem preços falsos.
- Navegador real em desktop/mobile: sala Investimentos 2D abre seção, Léo permanece acessível, status mostra preparação até habilitar, nenhuma transferência pessoal, link F-Insight abre separado.
- Sem merge, sem publicação no Render e sem ligação PF/PJ até comprovar CI e E2E. `PR #86` permanece DRAFT.

## Próximas fases (não ativadas)
Radar multiativo, histórico/gráficos licenciados, watchlist interna PF, alertas, comparadores, research via F-Insight Agent e integração consentida com dados PF. F-Insight Professional para assessores/escritórios segue ambiente separado.
