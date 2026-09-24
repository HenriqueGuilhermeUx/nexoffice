# NexOffice Compliance Hub V1

Status: branch de implementação isolada. Não integrar ao `main` sem validação completa e autorização explícita.

## Tese de produto

Compliance é uma capacidade nativa do NexOffice, não um menu de apps externos. NR1Check e MindCompliance permanecem produtos separados, com dados canônicos, regras e privacidade próprios.

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

A saída da triagem é somente um estado de relevância do onboarding:
- `not_relevant_now`
- `worth_checking`
- `review_recommended`
- `already_managed`

Esses estados não representam parecer jurídico.

## Contrato privacy-safe

### NexOffice -> compliance: contexto empresarial permitido
- `workspaceRef`
- `businessName`
- setor/classificação operacional
- flags empresariais simples explicitamente informadas pelo cliente

### Identidade de acesso na entrada federada
Quando a bridge server-to-server estiver configurada, o NexOffice pode enviar ao NR1Check somente a identidade do usuário já autenticado necessária para provisionar/reusar a conta (`userRef`, `userEmail`, `userName`). Esses dados nunca entram na URL do navegador; são transmitidos backend-to-backend e usados somente para autenticação/provisionamento. O NR1Check emite um ticket de login de uso único e curta duração. Se a federação falhar, o fluxo seguro anterior continua disponível como fallback.

### NexOffice -> compliance: proibido
- dados médicos/saúde
- respostas de questionários psicossociais
- denúncias/canal de relatos
- CPF ou dados pessoais de empregados
- documentos brutos

### compliance -> NexOffice: permitido
- status da integração
- status do diagnóstico
- status do programa de compliance
- quantidade de ações abertas
- quantidade de ações vencidas
- próximo prazo
- percentual de conclusão
- categorias agregadas de alto nível
- deep link/handoff seguro

### compliance -> NexOffice: proibido
- respostas individuais
- scores por empregado
- conteúdo de denúncias
- dados de saúde
- evidências confidenciais
- documentos brutos

## Fluxo mínimo V1

NexOffice
-> triagem leve de relevância
-> botão único de checagem
-> entrada federada NR1Check quando configurada, sem nova senha
-> fallback privacy-safe de login/cadastro quando a bridge estiver indisponível
-> NR1Check diagnóstico/onboarding
-> MindCompliance gestão contínua quando aplicável
-> resumo agregado volta ao NexOffice
-> Briefing Executivo usa somente o resumo seguro quando há algo acionável

## Arquitetura

- repositórios e bancos independentes
- nenhum banco compartilhado
- adapters server-side
- secrets apenas no backend
- provisioning idempotente
- ticket/session exchange single-use e curto quando suportado
- isolamento multi-tenant
- produto de origem continua dono dos dados canônicos
- efeitos externos permanecem approval-gated

## Estado do produto de origem

O repositório `HenriqueGuilhermeUx/nr1check` incorporou o PR #1 `Add privacy-safe NexOffice entry flow`, com fallback seguro que aceita somente `workspaceRef`, `businessName` e `sector`, expira o contexto em 24h e mantém todos os dados sensíveis no produto especializado.

A evolução passwordless está sendo desenvolvida separadamente no NR1Check, branch `feature/nexoffice-federated-entry`, usando bridge server-side e ticket Clerk de uso único. Nenhuma credencial real faz parte do código.

## Configuração necessária para ativar a federação

No NexOffice API:
- `NR1CHECK_WEB_URL`
- `NR1CHECK_API_URL`
- `NR1CHECK_BRIDGE_KEY`

No NR1Check API:
- `NEXOFFICE_BRIDGE_KEY` com o mesmo segredo
- Clerk já configurado no ambiente de destino

Sem essas variáveis, o NexOffice usa o fallback seguro existente e o restante do Compliance Hub continua funcionando.
