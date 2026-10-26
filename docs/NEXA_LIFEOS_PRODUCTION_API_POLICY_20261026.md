# Nexa Life OS PF — contrato de backend de produção (SEM LANÇAMENTO)

**26 de outubro de 2026** | Branch isolada filha da [PR #97](https://github.com/HenriqueGuilhermeUx/nexoffice/pull/97), não é alteração de Wallet ou NexOffices PJ. A marca pública é **Nexa**, não Nex Personal; `trynexa.com.br` será a plataforma Life OS e `wallet.trynexa.com.br` é exclusivamente a Nexa Wallet cripto.

## Entregue agora (somente código)

- `lifeos-production-policy.ts`: contrato de inicialização que recusa qualquer mistura com o ambiente de convite `NEX_PERSONAL_PREVIEW`, com `NEXOFFICE_DATABASE_SCOPE` do PJ ou com URLs de Wallet/preview. Exige servidor `https://life-api.trynexa.com.br` **ainda não provisionado**, frontend `https://trynexa.com.br`, modo produção explícito e operações externas + rotinas de negócio desativadas.
- Banco obrigatório e futuro **exclusivo**: PostgreSQL `nexa_lifeos_prod`, papel próprio `nexa_lifeos_app` e host explicitamente fixado em `NEXA_LIFEOS_DB_HOST_PIN`. A URL deve usar `sslmode=verify-full`, com servidor/certificado verificados; SSL apenas `require` e overrides de host ou conexão são rejeitados. **A checagem só analisa configuração: não conecta, cria banco nem executa migrations.**
- `lifeos-production-standby.ts` e `server-lifeos-production.ts`: bootstrap opcional com **somente `GET /health` (status standby)** e `GET /ready` sempre 503. Não carrega as rotas de cadastro, login, Maya, Open Finance, Privy ou transações; demais URLs retornam 404. Não reutiliza o banco de homologação nem cria usuários. **Não está registrado em Render, Netlify ou qualquer ambiente de produção.**
- `smoke-nexa-lifeos-production-backend.mjs`: testes negativos com DSN e senha fictícios para TLS fraco, esquema/usuário incorreto, host errado, CORS Wallet, flags de preview, migrations automáticas, operações externas e ativação sem aprovação. Com servidor Fastify injetado, verifica 404 para rotas financeiras, 403 para origem Wallet e 503 para readiness.
- GitHub CI: executa esse smoke depois de compilar a API; não usa credenciais, rede nem banco de clientes.

## Convenção de variáveis para **provisionamento futuro**
NÃO adicionar valores reais ao GitHub. O modelo abaixo **não provisiona nem executa um serviço**:

```ini
NODE_ENV=production
NEXA_LIFEOS_PRODUCTION=true
NEXA_LIFEOS_PROD_BACKEND_APPROVED=true
NEX_PERSONAL_PREVIEW=false
NEX_PERSONAL_PREVIEW_CI=false
NEXOFFICE_DATABASE_SCOPE=nexa-lifeos-production
NEXOFFICE_EXTERNAL_ACTIONS=false
NEXOFFICE_INTELLIGENCE_DAILY_ENGINE=false
AUTO_MIGRATE=false
ALLOWED_ORIGINS=https://trynexa.com.br
NEXA_LIFEOS_API_ORIGIN=https://life-api.trynexa.com.br
NEXA_LIFEOS_SESSION_AUDIENCE=nexa-lifeos-pf-v1
NEXA_LIFEOS_DB_HOST_PIN=<HOST_EXCLUSIVO_DO_PROJETO_POSTGRESQL_PF>
DATABASE_URL=postgresql://nexa_lifeos_app:<SECRET>@<HOST_EXCLUSIVO_DO_PROJETO_POSTGRESQL_PF>/nexa_lifeos_prod?sslmode=verify-full
DATABASE_SSL=true
```

**Isolamento real depende também de provisionamento e permissões externas.** A checagem de nome, papel e host evita vários erros operacionais, mas não comprova, sozinha, que o projeto Neon/PostgreSQL e suas políticas são separados. Confirmar no painel do provedor projeto, privilégios mínimos, backups, auditoria e ausência de conexão com o banco de teste.

## Continuam pendentes — NÃO liberar usuários

1. Criar projeto/DB/papel exclusivos de produção para Nexa PF, testar TLS real, backups, retenção e restore. Não migrar o banco de preview nem importar perfis de Wallet.
2. Revisar e adaptar migrations `nex_personal` ao banco PF de produção usando plano auditado, sem `AUTO_MIGRATE` no boot. Passar por migração e rollback num banco de ensaio vazio com a mesma versão PostgreSQL.
3. Desenvolver as rotas de identidade PF e sua audiência JWT própria, preferencialmente cookie seguro HttpOnly com estratégia CSRF, consentimento LGPD e separação de sessão no mesmo domínio da Wallet. **Nunca validar tokens da Wallet como PF**.
4. Habilitar API PF e endpoints reais apenas após testes de permissões por proprietário, rate limit persistente, CSP/CORS, recuperação de senha, privacidade, observabilidade e auditoria.
5. Aprovar e publicar rota `/meu-espaco/app/` (preparada em PR #97) somente depois de teste com backend PF real, e da proteção do Service Worker da Wallet (PR site #36), que permanece rascunho.
6. Validar UX em iOS/Android/PWA e rollback da Wallet; proteger rotas `/app`, `/portal`, `/cadastro`, `/api/v1` e saldos antigos.

**Comandos sem efeitos externos (somente após compilar API):**

```bash
npm run build -w @nexoffice/api
node scripts/smoke-nexa-lifeos-production-backend.mjs
```

Status: **engenharia de isolamento e API de espera implementadas; produção NÃO provisionada, NÃO conectada e NÃO liberada**.
