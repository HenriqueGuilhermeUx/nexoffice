# Nexa PF · Belvo sandbox — roteiro seguro (28/10/2026)

## Para começar (sem instalar Node)
1. Entrar no [dashboard Belvo](https://dashboard.belvo.com/) e selecionar o ambiente **Sandbox**, nunca Production.
2. Em **Developer Tools → API Keys**, confirmar a existência do par `secretId` + `secretPassword` (ambiente Sandbox). O password pode aparecer somente uma vez; guardar em gerenciador de senhas. **Não enviar no ChatGPT, GitHub, ticket ou captura de tela.**
3. No painel Belvo usar **Run in Postman**, fazer fork da coleção **em workspace privado** e selecionar o ambiente `Belvo - sandbox (...)`. Verificar `baseUrl = https://sandbox.belvo.com` (sem espaços, nunca `api.belvo.com`).
4. Abrir na coleção **Core Aggregation Resources → Institutions → Get List all institutions → Send**. Esperado HTTP **200** e uma lista de instituições. HTTP 401 geralmente significa chaves trocadas/ambiente errado; não compartilhar os valores no suporte.
5. Para Banking Brazil, testar o **Hosted Widget** com a instituição fictícia `ofmockbank_br_retail`, após construir o token do widget **no backend** e configurar callbacks HTTPS, termos/consentimento e webhook. Os dados de contas e transações chegam **assincronamente** após consentimento. Nunca usar logins bancários reais para o mockbank.
6. Criar endpoint de webhook dedicado com validação de assinatura e correlação de consentimento antes de registrar a URL na Belvo. **Não cadastrar** hoje `/webhook` ou `/callback` fictícios: não existe handler Belvo homologado nesta branch.
7. Na homologação da Nexa PF: dados de sandbox devem ficar **fisicamente separados** e visivelmente marcados como **fictícios**; não virar saldo confirmado no painel destinado a clientes. O sandbox da Belvo é zerado no primeiro dia de cada mês.
8. Para produção, solicitar habilitação/certificação à Belvo e novas credenciais de Production; nunca reutilizar as sandbox. Sem produção habilitada, o botão Open Finance real da Nexa permanece desativado.

## Variáveis para o backend da Nexa PF *somente de homologação*
No Render, service `nex-personal-preview-api`, workspace PF dedicado, em **Environment → Add Environment Variable** (somente depois de validar o par no Postman):
- `NEX_PERSONAL_PREVIEW=true` (já é obrigatório no ambiente).
- `BELVO_ENV=sandbox`
- `BELVO_SANDBOX_ENABLED=true`
- `BELVO_SANDBOX_SECRET_ID` = sua chave ID sandbox (secret).
- `BELVO_SANDBOX_SECRET_PASSWORD` = seu secret password sandbox (secret).

**Não definir** `BELVO_SECRET_ID` ou chave de produção nessa beta. Não colocar as chaves em `VITE_*` (isso expõe ao navegador), `.env` versionado, Netlify frontend, GitHub Actions logs, URL ou documentação. Ao mudar variáveis no Render, ele poderá reiniciar/reimplantar o serviço; verificar sempre o serviço/nome antes.

## Verificação técnica sem tocar nos dados dos clientes
Arquivo `scripts/check-nexa-belvo-sandbox.mjs`:
- *Só* executa com `NEX_PERSONAL_PREVIEW=true`, `BELVO_SANDBOX_ENABLED=true` e `BELVO_ENV=sandbox`.
- Lê o ID e password **apenas** do ambiente.
- Consulta **somente** `GET https://sandbox.belvo.com/api/institutions/?page_size=10`.
- Usa `Authorization: Basic` apenas server-to-server e nunca imprime a credencial, headers ou respostas brutas.
- Confere HTTP 200 e presença de lista de instituições; nada é criado, gravado ou conectado.
- Pode ser executado dentro de um terminal de homologação com Node 22+: `node scripts/check-nexa-belvo-sandbox.mjs`. Não executar em servidor ou banco de produção.
- CI roda `node --test scripts/smoke-nexa-belvo-sandbox.mjs` com simuladores, **sem solicitar nenhuma chave** ou efetuar chamadas externas.

## Próxima fase de engenharia
- Criar rota autenticada para pedir token OFDA do Hosted Widget no servidor, com purpose e scopes estritos, termos e 3 callbacks HTTPS já publicados.
- Implementar validação de autenticidade do webhook, deduplicação, status do consentimento (ativo, expirado, revogado), persistência restrita ao usuário PF e leitura idempotente via Belvo.
- Mapear contas, transações, cartões, investimentos e passivos suportados pelo parceiro para os modelos `nex_personal`, com distinção `sandbox_demo` / `verified_production` / `user_declared`.
- Reconciliar saldos e riqueza, sem somar BRL e USD/USDC e sem duplicar saldo de investimentos entre fontes.
- Testar consentimento, expiração, desconexão, indisponibilidade, reenvio de webhooks, outro usuário e atualização assíncrona.
- Só depois habilitar botão de conectar Open Finance na Nexa PF beta e, por último, homologar produção PF independente. A **Wallet continua com sessão e dados próprios**.

Referências oficiais:
- https://developers.belvo.com/pt-br/products/aggregation_brazil/prerequisites-get-started-in-10-minutes
- https://developers.belvo.com/pt-br/products/aggregation_brazil/aggregation-brazil-integration-widget
- https://developers.belvo.com/pt-br/developer_resources/resources-sandbox
