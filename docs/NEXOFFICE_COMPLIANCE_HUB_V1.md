# NexOffice Compliance Hub V1

Status: branch de implementação isolada. Não integrar ao `main` sem validação completa e autorização explícita.

## Tese de produto

Compliance é uma capacidade nativa do NexOffice, não um menu de apps externos. NR1Check/MindCompliance permanece o produto especializado, com dados canônicos, regras e privacidade próprios.

### NR1Check
- diagnóstico/porta de entrada para NR-1 e descoberta de necessidades de compliance ocupacional
- usado quando vale verificar aplicabilidade, gaps ou prontidão

### MindCompliance
- gestão contínua de compliance
- riscos, evidências, documentos, planos de ação, responsáveis, prazos e obrigações contínuas
- mais amplo que NR-1 e útil para diversos tipos de negócio

## Princípios de experiência

1. Integração quase invisível: não repetir informações que o NexOffice já conhece.
2. Valor primeiro: mostrar somente o que é relevante para a empresa agora.
3. Disponível para todos os clientes: mesmo quem não sabe se precisa de NR-1 pode fazer uma checagem inicial segura.
4. O NexOffice não emite conclusão jurídica automática. A triagem é orientação de relevância.
5. Dados sensíveis permanecem no produto especializado.
6. NexOffice recebe apenas resumo operacional seguro: status, quantidade de ações abertas, prazos, progresso e próximo passo.
7. Founder Cockpit e Briefing Executivo só consomem resumos seguros e Compliance só ganha atenção quando há pendência/prazo relevante.
8. Denúncias, respostas psicossociais, dados de saúde, respostas individuais, CPF, documentos brutos e evidências confidenciais não entram no banco do NexOffice.

## Triagem inicial de relevância NR-1

O onboarding pode perguntar apenas fatos empresariais simples, por exemplo:
- a empresa possui empregados?
- é MEI, ME/EPP ou outro enquadramento?
- já possui apoio de SST/gestão de riscos ocupacionais?
- já verificou NR-1/PGR?

A saída é apenas estado de relevância de produto:
- `not_relevant_now`
- `worth_checking`
- `review_recommended`
- `already_managed`

Esses estados não representam parecer jurídico.

## Contrato privacy-safe

### NexOffice -> produto especializado
O contexto empresarial permitido é:
- `workspaceRef`
- `businessName`
- setor/classificação operacional

Esse contexto não é colocado em query params legíveis. O backend do NexOffice gera um handoff HMAC-SHA256 assinado, com versão, nonce e expiração aproximada de 10 minutos.

Quando a entrada passwordless está disponível, a identidade mínima do usuário (`userRef`, `userEmail`, `userName`) cruza somente backend-to-backend para provisionar/reutilizar a conta Clerk. O navegador recebe apenas:
- ticket Clerk de uso único e ~120 segundos;
- handoff empresarial opaco assinado.

Nenhum e-mail, nome do usuário, workspace, CNPJ ou setor é colocado como parâmetro legível na URL federada.

### Dados proibidos na ponte
- dados médicos/saúde
- respostas de questionários psicossociais
- denúncias/canal de relatos
- CPF ou dados pessoais de empregados
- documentos brutos
- evidências confidenciais

### compliance -> NexOffice: permitido
- status da integração
- status do diagnóstico
- status do programa de compliance
- quantidade de ações abertas
- quantidade de ações vencidas
- próximo prazo
- percentual de conclusão
- categorias agregadas de alto nível
- deep link seguro para o produto especializado

### compliance -> NexOffice: proibido
- respostas individuais
- scores por empregado
- conteúdo de denúncias
- dados de saúde
- evidências confidenciais
- documentos brutos

## Fluxo V1

NexOffice
-> triagem leve de relevância
-> botão único de checagem
-> entrada passwordless quando Clerk/federação estiver configurado
-> fallback com handoff assinado quando a federação estiver indisponível
-> confirmação do CNPJ real no produto especializado
-> criação/vínculo da empresa em uma única transação
-> NR1Check diagnóstico/onboarding
-> MindCompliance gestão contínua
-> resumo agregado consultado server-to-server pelo NexOffice
-> cache seguro no workspace
-> Briefing Executivo / Founder Cockpit usam somente o resumo acionável

## Arquitetura

- repositórios e bancos independentes
- nenhum banco compartilhado
- adapter server-side
- `NEXOFFICE_COMPLIANCE_BRIDGE_SECRET` apenas no backend dos dois produtos
- mesma chave scoped autentica a API de resumo e assina o handoff
- provisioning de conta de autenticação sem criar empresa/CNPJ automaticamente
- vínculo `workspaceRef ↔ companyId` explícito e não sensível no produto especializado
- isolamento multi-tenant
- produto de origem continua dono dos dados canônicos
- efeitos externos permanecem approval-gated

## Endpoints NexOffice

- `GET /v1/compliance/overview`
- `PUT /v1/compliance/triage`
- `POST /v1/compliance/nr1check/handoff`
- `POST /v1/compliance/refresh`
- `POST /v1/internal/compliance/summary` — opção de push agregado, protegida pela chave scoped

## Contrato esperado no NR1Check/MindCompliance

- `POST /api/nexoffice/handoff/verify`
- `POST /api/integrations/nexoffice/session` — passwordless opcional
- `GET /api/internal/nexoffice/compliance-summary?workspaceRef=...`
- `GET /api/internal/nexoffice/health`

## Configuração

No backend NexOffice:
- `NR1CHECK_WEB_URL`
- `NR1CHECK_API_URL`
- `NEXOFFICE_COMPLIANCE_BRIDGE_SECRET`

No backend NR1Check/MindCompliance:
- `NEXOFFICE_COMPLIANCE_BRIDGE_SECRET` com o mesmo segredo
- Clerk configurado para o modo passwordless

Sem `NR1CHECK_API_URL` ou sem disponibilidade da federação, o handoff assinado continua funcionando como fallback. Sem o segredo scoped, o NexOffice não cria handoff nem aceita resumo de compliance.

## Validação obrigatória antes de merge

- build API + web
- isolamento entre tenants
- handoff adulterado/expirado rejeitado
- ticket passwordless curto e sem identidade em URL
- ingestão estrita rejeita payload com campos sensíveis
- banco especializado pode conter CPF, denúncia e evidência sentinela sem que nenhuma dessas strings apareça no resumo entregue ao NexOffice
- Executive Brief recebe somente `aggregate_only`
- nenhuma mudança habilita ações externas automáticas
