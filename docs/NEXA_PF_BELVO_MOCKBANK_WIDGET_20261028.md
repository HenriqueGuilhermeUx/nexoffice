# Nexa PF — Belvo OFDA Brasil, Banco Fictício (28/10/2026)

## Estado
Credenciais **sandbox** no Render foram autenticadas previamente com `GET /api/institutions/`; o serviço PF beta por convite continua isolado. Esta entrega adiciona as fundações do **Hosted Widget** e de uma caixa de entrada de webhooks, sem alterar o `main` NexOffices PJ, Wallet, Privy, Pix ou contas reais.

## Proteções por padrão
As chaves existentes `BELVO_SANDBOX_SECRET_ID` e `BELVO_SANDBOX_SECRET_PASSWORD` permanecem exclusivamente no servidor. A nova jornada fica **DESATIVADA POR PADRÃO**. Nenhuma nova variável de ambiente é aplicada automaticamente.

Para habilitar em um próximo teste controlado, o serviço PF beta precisará de:
- `BELVO_SANDBOX_WIDGET_ENABLED=true`, flag intencional (ausente = OFF);
- `BELVO_SANDBOX_MOCK_CPF` e `BELVO_SANDBOX_MOCK_NAME`, SOMENTE identidade fictícia documentada pelo fornecedor do mockbank. NUNCA CPF real de clientes;
- `BELVO_SANDBOX_TERMS_URL`, HTTPS de termos realmente publicados e específicos da homologação;
- `NEX_PERSONAL_PREVIEW_SELF_ORIGIN`, endereço HTTPS exato da própria beta (já usado no preview);
- `BELVO_SANDBOX_WEBHOOK_BEARER`, segredo independente com no mínimo 32 caracteres aleatórios, a ser inserido nos **Webhooks de Dados** do Dashboard Belvo como `Bearer <token>`, nunca reutilizar chave de API, sessão PF ou Wallet.
- Manter `NEX_PERSONAL_PREVIEW=true`, `BELVO_ENV=sandbox`, `BELVO_SANDBOX_ENABLED=true` e o banco isolado PF.

Se qualquer requisito faltar, `widgetAvailable=false`, o botão do banco fictício não aparece e a solicitação POST retorna 503 sem chamar a Belvo.

### API de demonstração
- `GET /v1/personal/belvo-sandbox/status` requer sessão PF autenticada, perfil PF ativo e e-mail permitido na beta. Informa somente status/flags; não expõe chaves, CPF, saldos ou tokens.
- `POST /v1/personal/belvo-sandbox/widget/start` com `{"confirmSandbox":true}` requer todas as mesmas verificações, limita tentativas por conta e produz token de acesso OFDA de 10 minutos **server-to-server** via `POST https://sandbox.belvo.com/api/token/`. Retorna só a URL do Hosted Widget: `https://widget.belvo.io/` com `locale=pt`, `country_codes=BR`, `access_mode=single`, `institutions=ofmockbank_br_retail` e `external_id` aleatório não identificável. Nunca envia refresh token ao navegador.
- A URL do widget exige ação expressa do testador; no painel aparece como **BANCO FICTÍCIO**, nunca confundida com banco real.
- Callbacks sucesso, saída e erro voltam ao endereço raiz da beta com um indicador visual. Retorno de callback **não prova** autorização nem vínculo de conta; não autoriza saldo ou pagamento.

### Webhooks de agregação: cuidado importante
Documentação atual da Belvo explica que no canal de agregação a autenticação adicional é opcional via `Bearer` ou `Basic`. **Não presumir assinatura HMAC**: não existe chave de assinatura validada neste fluxo. Nós exigimos um token Bearer próprio, comparado em tempo constante. Controle de origem/IP no ingress/edge pode complementar, mas nunca substitui o token.

- `POST /v1/personal/belvo-sandbox/webhook` somente é registrado se houver `BELVO_SANDBOX_WEBHOOK_BEARER` forte e flags sandbox.
- Limite 8192 bytes; aceita exclusivamente metadados padronizados; corpo bruto e PII não são persistidos.
- Somente eventos com `external_id` associado a uma tentativa PF conhecida (e `link_id`) são inseridos em `nex_personal.belvo_sandbox_events`; `webhook_id` único impede duplicação.
- Estado do evento permanece **pending_provider_verification**, até consulta servidor-servidor que confirme ownership, escopo e validade na Belvo. Nenhuma tabela de contas/saldos é alterada por webhook isolado.
- Para colocar em produção um webhook, configurar na Belvo **Data Webhooks** (não Payments). A URL só deve ser cadastrada depois de confirmar acessibilidade, token e retorno de eventos no preview.
- Belvo envia eventos assíncronos após consentimento; retornos de sucesso/exit no browser não são fonte de verdade.
- Não aceitar dados do sandbox como saldos verificados na interface de clientes.

### Evolução técnica
1. Integrar e verificar widget apenas com identidade e credenciais **fictícias** de `ofmockbank_br_retail`, URL de termos verificada e bearer exclusivo.
2. Testar evento real da Belvo e confirmar `pending_provider_verification`, duplicação, rotação do bearer, revogação e tenant isolation.
3. Desenvolver reconciliador **somente leitura** que verifica no servidor o link retornado, expiração, consentimento, dono e recursos. Sem sincronização para carteiras ou operações financeiras.
4. Buscar contas, extratos, investimentos e passivos da mockbank no sandbox com identificadores idempotentes e a marca `sandbox_demo`; nunca lançar dinheiro fictício no saldo real.
5. Somente após as revisões de segurança, dados reais no PF production Neon separado, LGPD/consentimento por finalidade, parceiros homologados e validação de titularidade poderão ser discutidos.

Referências oficiais:
- https://developers.belvo.com/pt-br/products/aggregation_brazil/ofda-widget-introduction
- https://developers.belvo.com/pt-br/products/aggregation_brazil/ofda-widget-startup-configuration
- https://developers.belvo.com/pt-br/developer_resources/resources-webhooks-aggregation
- https://developers.belvo.com/pt-br/developer_resources/resources-sandbox
