# NexOffice — operação standalone primeiro, integrações depois

Status: decisão oficial de arquitetura e implantação.

## Decisão

O NexOffice deve ser consolidado primeiro como uma operação independente, utilizável sem depender de NexJud, HealthWallet/MyDataMed ou SindCopilot.

A ordem oficial passa a ser:

1. NexOffice standalone funcional e validado.
2. Domínio próprio e URLs estáveis para frontend e API.
3. Acesso, workspace, administração, Central de Comando, Equipe Digital e integrações AV operando no próprio NexOffice.
4. Staging controlado, com `NEXOFFICE_EXTERNAL_ACTIONS=false`.
5. Só depois integrar produtos verticais, um de cada vez.
6. Cada produto mantém seu próprio domínio, dados canônicos, regras de negócio e UX principal.
7. NexOffice recebe apenas contexto operacional permitido, provisioning, handoff e sinais agregados definidos pelos contratos existentes.

## Endereços atuais de staging

- Frontend: `https://nexoffice-staging.onrender.com`
- API: `https://nexoffice-staging-api.onrender.com`
- Banco: `nexoffice-staging-db` no Render

O banco do NexOffice é dedicado. É proibido reutilizar banco de qualquer outro produto da Alternative Ventures.

## Domínio recomendado

Quando o domínio for adquirido, usar preferencialmente:

- `app.<dominio>` → frontend NexOffice
- `api.<dominio>` → API NexOffice

Exemplo conceitual:

- `app.nexoffice.com.br`
- `api.nexoffice.com.br`

O domínio é comprado em um registrador externo. Depois, os registros DNS são apontados para os serviços Render e os custom domains são verificados no Render. O Render cuida do TLS/HTTPS.

Após a migração para domínio próprio, atualizar obrigatoriamente:

- `WEB_APP_URL`
- `ALLOWED_ORIGINS`
- `VITE_API_URL`
- URLs de callback/handoff que utilizarem origem absoluta

Não desligar os subdomínios `onrender.com` até a validação completa do domínio customizado.

## Checklist do NexOffice standalone

Antes de conectar produtos verticais, validar no staging:

- cadastro e login próprios;
- criação e troca de workspace;
- membros e convites;
- CRM e pipeline;
- tarefas e agenda;
- financeiro/ledger;
- cobranças e reconciliação;
- documentos como referências, sem duplicar armazenamento canônico do DocWallet;
- Central de Comando;
- Equipe Digital;
- assistente com memória/contexto do workspace;
- approvals;
- outbox;
- integrações AV com indisponibilidade explícita quando não configuradas;
- usage/cost metering;
- isolamento multi-tenant;
- data firewalls;
- external effects permanecendo desabilitados durante staging.

## Regra de integração vertical

A integração será feita de fora para dentro.

O NexOffice oferece o contrato de plataforma. O produto vertical implementa a chamada para esse contrato sem transferir para o NexOffice a propriedade do domínio de negócio.

### NexJud

- `sourceProduct = nexjud`
- `vertical = legal`
- NexJud continua dono de processos, prazos, peças, documentos jurídicos, jurimetria e demais dados canônicos jurídicos.
- NexOffice recebe somente provisioning, identidade federada/handoff e sinais operacionais agregados autorizados.

### HealthWallet / MyDataMed

- `sourceProduct = mydatamed` ou contrato equivalente já definido para HealthWallet
- `vertical = health`
- HealthWallet/MyDataMed continua dono de dados do paciente, exames, medicamentos, histórico, Medical Passport, MedScore, dispositivos e demais dados clínicos/pessoais.
- NexOffice não recebe prontuário nem dados clínicos brutos.
- NexOffice recebe somente sinais operacionais agregados permitidos pelo firewall Health.

### SindCopilot

- `sourceProduct = sindcopilot`
- `vertical = condo`
- SindCopilot continua dono dos dados canônicos de condomínio, compliance, documentos, fornecedores, comunicações e demais fluxos do produto.
- NexOffice recebe apenas sinais operacionais agregados e o contexto de provisioning/handoff permitido.

---

# PROMPT 1 — levar para a conversa do NexJud

Copie e cole integralmente na conversa oficial do NexJud:

```text
Quero implementar a integração do NexJud com o NexOffice, respeitando integralmente a arquitetura já definida nos dois produtos.

IMPORTANTE:
- Não redesenhe o NexJud.
- Não transforme o NexOffice no sistema jurídico canônico.
- Não mova processos, peças, jurimetria, documentos jurídicos ou outros dados canônicos do NexJud para o NexOffice.
- Não altere produção sem validação controlada.
- Faça primeiro em ambiente controlado/staging.

NEXOFFICE STAGING:
Frontend: https://nexoffice-staging.onrender.com
API: https://nexoffice-staging-api.onrender.com

CONTRATO JÁ EXISTENTE NO NEXOFFICE:
- sourceProduct: nexjud
- vertical: legal
- typed helper: provisionNexJud()
- typed session helper: exchangeNexJudSession()
- firewall Legal aggregate-only
- provisioning idempotente
- federated session exchange
- handoff single-use
- isolamento de tenant
- sinais operacionais legais agregados

OBJETIVO:
Implementar no NexJud a camada cliente/adapter necessária para:
1. Provisionar automaticamente o tenant/workspace correspondente no NexOffice.
2. Provisionar membros/identidades necessárias sem criar duplicidade.
3. Gerar handoff seguro do NexJud para o NexOffice.
4. Fazer session exchange federado no NexOffice.
5. Preservar papéis/roles corretamente.
6. Enviar apenas sinais operacionais jurídicos agregados permitidos pelo contrato.
7. Nunca enviar dados jurídicos brutos ou canônicos que pertençam ao NexJud.
8. Garantir idempotência e isolamento entre clientes/tenants.
9. Criar smoke tests específicos da integração NexJud → NexOffice.
10. Manter efeitos externos do NexOffice desabilitados durante staging.

Antes de alterar código, leia o estado atual do repositório do NexJud e identifique onde encaixar o adapter sem quebrar a arquitetura atual. Depois execute a implementação completa, faça commits e valide CI/testes.

Ao final, me informe exatamente:
- arquivos alterados;
- endpoints/fluxos implementados;
- variáveis de ambiente necessárias;
- commit SHA;
- resultado dos testes;
- qualquer ação manual que eu precise fazer.
```

---

# PROMPT 2 — levar para a conversa do HealthWallet / MyDataMed

Copie e cole integralmente na conversa oficial do HealthWallet/MyDataMed:

```text
Quero implementar a integração HealthWallet/MyDataMed → NexOffice, mantendo todas as decisões atuais de produto, privacidade, Health Connect e arquitetura do HealthWallet.

IMPORTANTE:
- Não redesenhe HealthWallet/MyDataMed.
- Não altere a estratégia atual do HealthWallet Connect / Google Play.
- Não mova dados pessoais ou clínicos canônicos para o NexOffice.
- Não envie exames, medicamentos, prontuário, Medical Passport, MedScore, dados de dispositivos ou outros dados clínicos brutos ao NexOffice.
- Não publicar em produção antes da validação controlada.

NEXOFFICE STAGING:
Frontend: https://nexoffice-staging.onrender.com
API: https://nexoffice-staging-api.onrender.com

CONTRATO JÁ EXISTENTE NO NEXOFFICE:
- sourceProduct: mydatamed
- vertical: health
- typed helper: provisionMyDataMed()
- typed session helper: exchangeMyDataMedSession()
- Health firewall aggregate-only
- scope permitido no Health: workspace/team; member-level não é permitido
- provisioning idempotente
- federated auth/handoff
- sinais operacionais de appointments, requests, SLA, workload e programs
- privacy = aggregate_only
- externalEffects = false em staging

OBJETIVO:
Implementar no HealthWallet/MyDataMed a camada cliente/adapter necessária para:
1. Provisionar o tenant/workspace correspondente no NexOffice.
2. Provisionar identidade/membros permitidos.
3. Gerar handoff seguro para o NexOffice.
4. Fazer session exchange federado.
5. Enviar exclusivamente sinais operacionais agregados permitidos pelo Health firewall.
6. Garantir que nenhuma informação clínica ou pessoal proibida atravesse a fronteira.
7. Garantir idempotência e isolamento de tenant.
8. Criar smoke tests de privacy boundary e integração HealthWallet/MyDataMed → NexOffice.
9. Manter produção e a estratégia Health Connect/Google Play intocadas.
10. Manter efeitos externos do NexOffice desligados no staging.

Antes de alterar código, leia o estado atual do repositório e preserve integralmente o trabalho em andamento. Implemente de forma modular, faça commits e valide CI/testes.

Ao final, informe:
- arquivos alterados;
- dados que cruzam e que NÃO cruzam a fronteira;
- endpoints/fluxos implementados;
- variáveis de ambiente necessárias;
- commit SHA;
- resultado dos testes;
- qualquer ação manual necessária.
```

---

# PROMPT 3 — levar para a conversa do SindCopilot

Copie e cole integralmente na conversa oficial do SindCopilot:

```text
Quero implementar a integração SindCopilot → NexOffice sem alterar o domínio canônico e a operação principal do SindCopilot.

IMPORTANTE:
- Não redesenhe o SindCopilot.
- SindCopilot continua dono dos dados e fluxos canônicos de condomínio.
- NexOffice funciona como camada operacional horizontal e de coordenação.
- Não publicar alterações perigosas diretamente em produção sem validação controlada.

NEXOFFICE STAGING:
Frontend: https://nexoffice-staging.onrender.com
API: https://nexoffice-staging-api.onrender.com

CONTRATO JÁ EXISTENTE NO NEXOFFICE:
- sourceProduct: sindcopilot
- vertical: condo
- typed helper: provisionSindCopilot()
- typed session helper: exchangeSindCopilotSession()
- pushCondoSignal()
- Condo firewall aggregate-only
- scope permitido: workspace/team
- sinais de portfolio, compliance, documents, notices e suppliers
- provisioning idempotente
- federated auth/handoff
- privacy = aggregate_only
- externalEffects = false no staging

OBJETIVO:
Implementar no SindCopilot a camada cliente/adapter necessária para:
1. Provisionar tenant/workspace no NexOffice.
2. Provisionar owner e demais membros necessários preservando roles.
3. Gerar handoff seguro SindCopilot → NexOffice.
4. Fazer session exchange federado.
5. Enviar somente sinais operacionais agregados permitidos pelo firewall Condo.
6. Manter os dados canônicos e documentos do condomínio no SindCopilot.
7. Garantir idempotência e isolamento multi-tenant.
8. Criar smoke tests da integração SindCopilot → NexOffice.
9. Não habilitar efeitos externos no NexOffice durante staging.
10. Validar o fluxo completo antes de qualquer ampliação para produção.

Leia primeiro o estado atual do repositório SindCopilot para encaixar essa integração sem quebrar o que já está funcionando. Depois implemente, faça commits e rode CI/testes.

Ao final, informe:
- arquivos alterados;
- endpoints/fluxos implementados;
- variáveis de ambiente necessárias;
- commit SHA;
- testes executados e resultado;
- ações manuais restantes, se houver.
```

## Sequência de execução recomendada

Após o NexOffice standalone estar validado:

1. SindCopilot → NexOffice, por ser o contrato operacional mais simples e com baixo risco de dados sensíveis.
2. NexJud → NexOffice, validando cuidadosamente isolamento e fronteira jurídica.
3. HealthWallet/MyDataMed → NexOffice por último, com validação de privacidade/compliance mais rigorosa.

Nenhuma dessas integrações deve habilitar efeitos externos reais do NexOffice durante staging.
