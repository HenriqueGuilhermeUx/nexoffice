# NexOffice — handoff oficial de continuidade

Data: 18 de setembro de 2026

Este documento consolida o estado atual do NexOffice para continuidade em um novo chat sem perda de contexto.

## 1. Escopo desta conversa

Esta linha de trabalho é exclusivamente sobre **NexOffice**. Não misturar implementação de outros produtos da Alternative Ventures, exceto quando eles forem consumidos como motores/capabilities do NexOffice.

Regra principal: o NexOffice é a experiência e a camada operacional; produtos especializados continuam donos de seus próprios domínios, bancos e regras.

## 2. Repositório e produção atual

Repositório: `HenriqueGuilhermeUx/nexoffice`
Branch: `main`

HEAD validado antes deste handoff:

`0f104870d3d6c6584014e12e8c768a3c8a6069f3` — `Enforce trial activation and payment grace consistently`

CI desse HEAD:

- `build`: success
- `integration`: success

Deploy Render desse HEAD:

- backend: live
- frontend: live

URLs canônicas:

- Frontend: `https://nexoffices.com.br`
- API: `https://api.nexoffices.com.br`

Fallbacks técnicos Render:

- frontend: `https://nexoffice-staging.onrender.com`
- API: `https://nexoffice-staging-api.onrender.com`

Banco dedicado: `nexoffice-staging-db`.

## 3. Regra de segurança que NÃO pode ser alterada automaticamente

`NEXOFFICE_EXTERNAL_ACTIONS=false`

Essa flag continua sendo o gate global para efeitos externos no staging. Não ligá-la sem instrução explícita do usuário.

Billing é controlado separadamente e está habilitado.

## 4. Posicionamento comercial

Categoria:

**NexOffice — o sistema operacional do seu negócio.**

Mensagem principal:

> Pare de tocar sua empresa no WhatsApp, nas planilhas e na sua cabeça.

Promessa:

> O NexOffice reúne o que está acontecendo no negócio, mostra o que precisa de atenção e coloca uma equipe digital para ajudar a empresa a executar — sem tirar o dono do controle.

Oferta atual:

- NexOffice Pro
- preço fundador: R$ 197/mês
- 7 dias grátis
- sem cartão durante o trial
- Pix Automático após autorização
- cancelamento pelo próprio NexOffice

Existe playbook comercial em `docs/NEXOFFICE_COMMERCIAL_LAUNCH_PLAYBOOK.md`.

## 5. Decisão comercial atual

O produto está em ponto de **começar divulgação e venda founder-led agora**.

Não continuar adicionando features antes de colocar clientes reais para usar, salvo correções críticas encontradas no onboarding, cobrança ou operação.

Prioridade da próxima conversa:

1. começar aquisição;
2. acompanhar primeiros trials;
3. observar onboarding e ativação;
4. corrigir apenas fricção real;
5. coletar linguagem e prova de valor dos primeiros clientes;
6. só depois voltar a ampliar escopo.

## 6. Produto disponível

Core horizontal:

- Central de Comando
- CRM e pipeline
- agenda e tarefas
- financeiro operacional
- cobranças
- documentos
- Equipe Digital
- integrações
- permissões e políticas de aprovação
- Cliente 360
- Flexible Modules
- Creator Pack
- CSV/OFX + conciliação
- Visão Financeira com projeções, alertas, recomendações e cenários “E se?”
- histórico longitudinal financeiro / decisões e resultados

Flexible Modules é feature da plataforma inteira, não uma vertical separada.

Creator Pack é um pack oficial do NexOffice sobre o mesmo core.

## 7. Equipe Digital / capabilities

O Capability Graph está no core. Fonte canônica:

`apps/api/src/capability-registry.ts`

Agentes principais:

- Sofia — Secretária
- Alex — Atendimento
- Clara — CRM
- Nico — Operação financeira
- Theo — Cobrança / Controladoria
- Dora — Documentos
- Maya — Growth

Princípio:

**observar → entender → explicar → recomendar → preparar → aprovar → executar → conferir → aprender**

Não criar “mais IAs” desnecessariamente. Aumentar ferramentas reais das IAs existentes.

## 8. Ecossistema reaproveitado

### DocWallet

Ativo para:

- inteligência documental
- classificação
- partes
- datas
- valores
- obrigações
- alertas
- vencimentos

Arquivos/texto bruto permanecem no domínio DocWallet; NexOffice recebe apenas metadados estruturados autorizados.

### Staff

Staff Business Bridge está ativo para conversa empresarial.

Contrato de privacidade validado:

- `workspace_context_only`
- `personalMemoryAccess=false`
- `externalActions=false`

Não importar memória pessoal do Staff para NexOffice.

### SmartBots

Usado/planejado como rail de comunicação operacional.

Envio continua approval-first. Não transformar SmartBots em canal autônomo sem governança.

### NextGen

Pode ser usado para cobrança/reconciliação/padrões de execução, mas **Bank Connect fica fora do escopo atual**.

Decisão estratégica: esperar futura parceria bancária/Open Finance em vez de integrar um agregador agora.

### NexJud

NexOffice consome apenas sinais jurídicos agregados. Processos, peças, jurisprudência e estratégia permanecem no NexJud.

### SindCopilot

NexOffice consome apenas sinais condominiais agregados. Dados de condomínio/moradores/ocorrências permanecem no SindCopilot.

### F-Insight

Reutilizar metodologia de raciocínio financeiro, não banco de dados.

A Visão Financeira do NexOffice já segue essa direção: explicar em português simples, mostrar premissas e transformar números em ação.

### TaxAgent

Integração fiscal existe sob governança/approval-first. Não emitir externamente enquanto o gate global estiver desligado.

## 9. MODO / Marketing

Regra arquitetural:

**MODO continua sendo o motor central de Marketing/Growth. NexOffice é a experiência e governança.**

Não copiar/forkar MODO e não compartilhar banco.

MODO atual no momento deste handoff:

repo `HenriqueGuilhermeUx/modo`
main observado: `2a935b2414791f811a173ea5e48cec9ec0e9c065`

Esse estágio inclui melhorias recentes de Google Ads OAuth dentro da própria MODO.

NexOffice já consome MODO para:

- Demand / Growth
- Ads Copilot / planejamento
- landing/funil
- Google Ads metrics read
- media OAuth preparation
- Market Radar via Apify
- prospecção B2B / ICP
- discovery B2B guarded
- criação de drafts de conteúdo via MODO Content Engine + OpenAI

Market Radar:

- leitura: active
- coleta: guarded + aprovação explícita
- provider validado: Apify
- sem comunicação externa automática

Conteúdo:

- criação de draft: active
- workspace scoped
- `modoCreditsCharged=0`
- aprovação interna existe
- `publishing=false`
- `externalPublication=false`

A área Marketing no frontend possui drafts, preview e “Criar com Maya”.

### Metricool

**Não usar como dependência para lançar NexOffice.**

A decisão atual é deixar Metricool de lado por custo, autenticação e complexidade. O fato de existir código relacionado na MODO não muda essa decisão.

Publicação social automática não é pré-requisito de venda.

### Publicação social

No rollout atual:

- conteúdo pode ser criado, revisado e aprovado;
- publicação automática permanece fora do NexOffice;
- `growth.publish` continua planned / external / approval-required.

### Google Ads

Planejamento, governança e métricas fazem parte do bridge.

Ativação de campanha/orçamento permanece separada e não deve ser liberada automaticamente.

Usar OAuth oficial e aprovação explícita.

## 10. Financeiro e moat de longo prazo

Tese estratégica aprovada:

O moat não é “ter IA”. É entender a empresa como sistema longitudinal e conectar:

marketing → lead → venda → recebível → pagamento → imposto → margem → caixa → decisão → resultado.

A experiência para o usuário deve continuar simples, sem inventar muitos nomes comerciais.

Hoje aparece como **Visão financeira**, com:

- posição de caixa
- projeções
- recebíveis e pagamentos
- atrasos
- risco de falta de caixa
- concentração de receita
- pipeline
- alertas explicados por números
- recomendações
- simulações “E se?”

Por baixo, preservar histórico de situação → recomendação → decisão → resultado.

Bank Connect continua adiado.

## 11. Billing / Woovi — estado final para lançamento founder

Billing está habilitado separadamente do gate global de efeitos externos.

Frontend:

- banner de trial/plano
- checkout Pix Automático
- preço e mensalidade claros
- trial de 7 dias
- aceite explícito de Termos, Privacidade e Cancelamento antes de assinar
- cancelamento de renovação pelo próprio NexOffice

Páginas públicas implementadas:

- Termos de Uso
- Política de Privacidade
- Política de Cancelamento
- Suporte

Arquivos principais:

- `apps/web/src/PublicLegal.tsx`
- `apps/web/src/public-legal.css`

Woovi:

- subscribe
- refresh
- cancel
- webhooks de billing implementados
- idempotência de eventos
- fallback quando registro de webhook exige escopo não disponível
- reconciliação periódica por polling a cada 15 minutos
- reconciliação de subscription + installments
- estados active / past_due / cancelled / expired
- 7 dias de grace para past_due antes de bloquear acesso
- trial/pending activation são bloqueados corretamente quando trial expira

Commits de fechamento de billing imediatamente antes deste handoff:

- `28aa32e...` — Add Woovi billing reconciliation fallback
- `57b86253...` — Run periodic Woovi billing reconciliation
- `0f104870...` — Enforce trial activation and payment grace consistently

## 12. Jurídico / suporte

As páginas atuais são um baseline operacional de lançamento, não substituem revisão jurídica especializada para escala maior.

O suporte durante a fase fundador é direto pelo canal comercial/onboarding usado com o cliente.

Não inventar e-mail público de suporte sem confirmar que a caixa existe.

## 13. O que NÃO deve bloquear as primeiras vendas

Não bloquear lançamento por:

- Metricool
- publicação social automática
- Bank Connect
- embedded banking
- novas verticais
- mais agentes de IA
- automação externa total
- campanha Google Ads auto-ativada

Esses pontos podem evoluir após feedback real.

## 14. O que monitorar nos primeiros clientes

Aquisição:

- landing → trial
- origem do lead

Ativação:

- workspace criado
- primeiro contato/deal
- primeira tarefa/agenda
- primeiro registro financeiro
- primeira visita à Central de Comando
- primeira interação com Equipe Digital
- primeiro uso de Marketing/Maya quando aplicável

Conversão:

- trial → autorização Pix
- autorização → active
- primeira cobrança recorrente
- past_due / recuperação
- cancelamentos e motivo

Retenção:

- uso semanal
- áreas utilizadas
- Central de Comando
- Equipe Digital
- Marketing
- Visão financeira

## 15. Prompt para abrir a próxima conversa

Copie e cole o bloco abaixo no novo chat:

---

**CONTINUIDADE OFICIAL — NEXOFFICE**

Quero continuar EXATAMENTE do ponto em que paramos o desenvolvimento e lançamento do NexOffice.

NÃO recomece o projeto, NÃO redesenhe o produto e NÃO me faça repetir contexto. Primeiro leia o repositório e este handoff, confirme o HEAD atual e continue execução.

REPOSITÓRIO PRINCIPAL:
`https://github.com/HenriqueGuilhermeUx/nexoffice`

DOCUMENTO DE HANDOFF OBRIGATÓRIO:
`docs/NEXOFFICE_CONTINUATION_HANDOFF_2026-09-18.md`

HEAD VALIDADO AO CRIAR O HANDOFF:
`0f104870d3d6c6584014e12e8c768a3c8a6069f3`

DOMÍNIOS:
- Frontend: `https://nexoffices.com.br`
- API: `https://api.nexoffices.com.br`

REGRA CRÍTICA:
`NEXOFFICE_EXTERNAL_ACTIONS=false` deve permanecer false. Não liberar efeitos externos globais sem minha ordem explícita.

STATUS COMERCIAL:
O NexOffice está pronto para iniciar venda founder-led. A prioridade agora NÃO é criar mais features. É começar divulgação, onboarding de clientes reais, validar ativação, trial, cobrança, retenção e corrigir somente fricção observada.

OFERTA:
- NexOffice Pro
- R$ 197/mês no preço fundador
- 7 dias grátis
- sem cartão no trial
- Pix Automático após autorização
- cancelamento dentro do NexOffice

BILLING:
Woovi está integrado com subscribe/refresh/cancel, webhook quando permitido, fallback por polling a cada 15 minutos, reconciliação de installments e carência de 7 dias para past_due. Termos/Privacidade/Cancelamento/Suporte e aceite explícito já estão no frontend.

MODO:
MODO é o motor de Marketing/Growth; não copiar e não compartilhar banco. O NexOffice já usa Demand, Ads, métricas Google, Market Radar/Apify, prospecção B2B e Content Engine/OpenAI. Conteúdo pode ser criado e aprovado; publicação automática continua fora do rollout. Metricool deve ser ignorado como dependência de lançamento.

MARKETING:
Maya já trabalha com Radar de Mercado, prospecção B2B, planejamento/métricas Ads e criação de conteúdo. Não ativar campanha, orçamento ou publicação sem aprovação explícita e infraestrutura autorizada.

ECOSSISTEMA:
Reutilizar capabilities existentes de Staff, DocWallet, SmartBots, NextGen, NexJud, SindCopilot, MODO, F-Insight e TaxAgent através do Capability Graph. Não duplicar bancos nem motores.

BANK CONNECT:
Fora do escopo atual. A ideia é futuramente fazer parceria com banco/financeira que ofereça conta/Open Finance/produtos dentro da experiência NexOffice. Não escolher agregador agora.

PRIORIDADE DESTA NOVA CONVERSA:
1. Verificar HEAD/CI/deploy atual antes de mexer.
2. Manter produto estável.
3. Me ajudar a começar a DIVULGAR E VENDER.
4. Preparar/acompanhar primeiros clientes e trials reais.
5. Criar materiais/campanhas comerciais apenas com claims suportados pelo produto atual.
6. Corrigir rapidamente bugs reais de onboarding, cobrança ou uso.
7. Evitar ampliar escopo até termos feedback de clientes reais.

Também leia:
- `docs/NEXOFFICE_COMMERCIAL_LAUNCH_PLAYBOOK.md`
- `docs/ECOSYSTEM_CAPABILITY_GRAPH.md`
- `docs/NEXOFFICE_STANDALONE_AND_PRODUCT_HANDOFFS.md`
- `docs/AV_CAPABILITY_AUDIT.md`

Quando terminar de ler e verificar, me diga objetivamente o estado atual e comece a execução comercial. BORA.

---
