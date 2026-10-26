# Nexa Life OS — pré-produção isolada (26/10/2026)

**Não é um deploy nem um ambiente de produção criado.** Esta pasta documenta o contrato obrigatório antes de provisionar o primeiro serviço de produção da plataforma PF Nexa.

## Arquitetura imutável
- `trynexa.com.br`: Nexa Life OS PF e área pública. O futuro aplicativo está reservado para `/meu-espaco/app/`.
- `wallet.trynexa.com.br`: Nexa Wallet cripto, Privy, Pix/USDC, endereços e saldos originais. Nada dessa estrutura é migrado por este trabalho.
- `api-life.trynexa.com.br`: **hostname reservado/proposto, ainda não provisionado**, para a API do Life OS exclusivamente PF.
- PostgreSQL Neon: projeto novo e exclusivo (diferente do projeto de homologação `orange-fog-28021931`); database `nexa_lifeos_prod`, usuário de acesso mínimo.
- Render: serviço web novo e exclusivo para PF. NÃO alterar `nex-personal-preview-api`, `nexa-backend`, NexOffices PJ ou bancos de clientes.

## Contrato implementado (sem conexões)
`node scripts/check-nexa-lifeos-prod-env.mjs` **falha sem as variáveis reais** e apenas examina configuração local, nunca consulta banco/API nem imprime senhas.
`node --test scripts/smoke-nexa-lifeos-prod-env.mjs` valida dados falsos e os casos bloqueados, sem recursos externos.
`node scripts/plan-nexa-lifeos-prod-migrations.mjs` gera um manifesto SHA256 read-only para revisão. **NÃO EXECUTA MIGRAÇÕES**.

Exigências:
- flags `NEXA_LIFEOS_ENV=production`, `NODE_ENV=production`, `NEXA_LIFEOS_PROD_RELEASE_APPROVED=true` após revisão;
- efeitos financeiros/rotinas PJ desabilitados, `AUTO_MIGRATE=false`, signup público inicialmente **false**;
- `ALLOWED_ORIGINS=https://trynexa.com.br` exata, sem wildcard, sem `wallet.*`; `NEXA_LIFEOS_API_ORIGIN` e `VITE_NEXA_LIFEOS_API_URL` iguais a `https://api-life.trynexa.com.br`;
- `DATABASE_URL` de DB separado `nexa_lifeos_prod`, host Neon e TLS `sslmode=verify-full`, sem parâmetros host/ssl alternativos. Projeto Neon de produção deve ser **independentemente verificado pelo painel/API de administração**, pois o ID informado por variável sozinho não prova pertença;
- `SESSION_TTL_DAYS` explícito entre 1 e 14; sem chaves/tokens de prévia nem duplicação de Wallet Privy;
- política final de autorização deve validar cada usuário PF, segregar audiências dos tokens, impedir leitura cruzada e passar testes de login/recuperação/LGPD.

## Migrações: NÃO reaproveitar cegamente o preview
O manifesto lista como **referências de revisão** `infra/personal-preview/001_identity.sql` e migrações `046`–`049` de `nex_personal`. O nome do primeiro arquivo é histórico; revisar DDL, permissões, RLS/ownership, auditoria, índices, consentimentos, rollback e plano de backup antes de criar migrações específicas de produção. Não utilizar `runPersonalPreviewMigrations` ou `AUTO_MIGRATE` no banco definitivo. Uma etapa futura poderá usar tabela de migração **nova**, transações e checksum após revisão.

## O que NÃO foi feito
Não foi criado banco, endpoint público, DNS, chaves, serviço Render ou conta de usuário PF em produção. **A única base Neon identificada pela integração neste workspace foi a de homologação**, que permanece intacta. Nenhum custo novo deve ser contratado implicitamente.

## Gates antes de produção
1. Criar/provisionar projeto Neon PF exclusivo, política de backup, menor privilégio e TLS; confirmar identificador real sem expor senha.
2. Aprovar migrations PF de produção e executar validação em banco DESCARTÁVEL primeiro; backup/rollback e verificação de isolamento de clientes.
3. Implementar servidor `server-personal-production` dedicado (o atual `server-personal.ts` exige homologação/convite e NÃO pode ser reutilizado por mudança simples de env), com autenticação, rate limit distribuído, antiabuso, LGPD, consentimentos e endpoints permitidos.
4. CSP/CORS e sessão de mesmo domínio PF revisadas; nunca compartilhar token PF com Wallet nem criar carteira Privy redundante.
5. Testar build `release`, novo API server, DB/segurança, 16 salas, Maya e F-Insight, sem operações reais.
6. Só depois publicar `/meu-espaco/app/`, revisar SW PWA raiz da Wallet (PR site #36), configurar redirects e atualizar o CTA principal, com rollback.

Estado: especificações e testes preparatórios; **NO-GO para uso de clientes reais**.
