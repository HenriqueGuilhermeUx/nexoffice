# NexOffice — staging controlado

Este runbook prepara o primeiro staging do NexOffice sem alterar produção de nenhuma venture e sem habilitar efeitos externos.

## Regras obrigatórias

- usar PostgreSQL dedicado exclusivamente ao NexOffice staging;
- nunca reutilizar `nexa-wallet-v15-staging-db` nem qualquer banco de outra venture;
- manter `NEXOFFICE_EXTERNAL_ACTIONS=false`;
- não colocar secrets no Git, frontend, logs ou banco em plaintext;
- usar `NEXOFFICE_INTERNAL_KEY` forte e exclusivamente server-side;
- restringir `ALLOWED_ORIGINS` ao domínio HTTPS do staging;
- manter Pix, WhatsApp outbound, assinatura, emissão fiscal e publicação/alteração de campanha nos fluxos de governança já existentes;
- não configurar preços até a telemetria de custo real ter cobertura suficiente.

## Gate antes do deploy

Execute com as variáveis reais do staging:

```bash
node scripts/check-staging-readiness.mjs
```

O gate falha se:

- o ambiente não estiver explicitamente marcado como `staging`;
- o banco não estiver marcado como `nexoffice-staging`;
- houver tentativa de reutilizar o banco de staging da Nexa;
- efeitos externos estiverem habilitados;
- a chave interna estiver ausente, curta ou com valor de teste;
- CORS estiver aberto com `*`;
- frontend/origens não usarem HTTPS.

## Sequência do primeiro staging

1. Confirmar CI do `main` completamente verde.
2. Provisionar PostgreSQL dedicado ao NexOffice staging.
3. Configurar as variáveis a partir de `.env.staging.example`, usando secrets reais somente no runtime do provedor de hospedagem.
4. Rodar o gate `check-staging-readiness.mjs`.
5. Aplicar `schema.sql` e migrations `002` a `012` em ordem.
6. Subir somente a API NexOffice.
7. Validar `/health`, autenticação, workspace, CRM, financeiro, Platform Provisioning, firewalls, Command Center, Equipe Digital e usage sem efeitos externos.
8. Publicar o frontend de staging apontando `VITE_API_URL` para a API validada.
9. Validar handoff embutível de NexJud/MyDataMed/SindCopilot em ambiente controlado.
10. Configurar bridges AV um a um; capability não configurada deve permanecer explicitamente indisponível.
11. Manter `NEXOFFICE_EXTERNAL_ACTIONS=false` até uma decisão posterior e validação controlada específica para cada efeito externo.

## O que não é necessário no primeiro deploy

DocWallet, Staff, SmartBots, NextGen, MODO e TaxAgent podem começar sem credenciais no staging. O NexOffice deve mostrar essas capabilities como não configuradas em vez de inventar disponibilidade. Isso permite validar Core, tenancy, UX, provisioning, governança e firewalls antes de conectar efeitos reais.

## Ponto que exige autorização do proprietário

Se não houver vaga gratuita para um PostgreSQL dedicado, criar um banco pago é uma decisão com custo e deve ser autorizada antes do provisionamento. Até essa autorização, o repositório pode ficar staging-ready sem criar nenhum recurso externo.
