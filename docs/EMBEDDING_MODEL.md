# Standalone, Add-on e Platform

NexOffice tem um único core e três experiências de entrada.

## 1. Standalone

Cliente entra diretamente no NexOffice.

```text
NexOffice Auth
  ↓
Workspace
  ↓
Core + módulos contratados
```

`workspace_origins.mode = standalone`.

## 2. Add-on dentro de uma venture AV

Exemplo NexJud:

```text
Usuário autenticado no NexJud
          ↓
NexJud cria/resolve o workspace NexOffice
          ↓
external_identity liga o usuário ao workspace
          ↓
NexOffice entrega CRM/ERP/Command/Agents
          ↓
Legal Pack traduz eventos e entidades específicas
```

A UX pode ser embutida/white-label dentro do produto vertical ou aberta em rota NexOffice preservando o contexto.

`workspace_origins.mode = addon`.

O produto de origem não copia tabelas do NexOffice. Ele mantém suas entidades verticais e referências.

## 3. Platform capability

Uma venture pode consumir apenas endpoints/eventos do NexOffice sem carregar toda a interface.

Exemplo:

```text
SindCopilot
  → POST evento para NexOffice
  → NexOffice cria ação/aprovação
  → callback/evento retorna resultado
```

`workspace_origins.mode = platform` quando o NexOffice atua principalmente como capability backend.

## Identidade

`external_identities` liga sujeitos autenticados em produtos externos ao workspace NexOffice. Não exige que todos os produtos migrem imediatamente para o mesmo provedor de autenticação.

Campos essenciais:

- provider
- external_subject
- external_tenant_ref
- workspace_id
- user_id NexOffice quando existir

Isso permite unificação gradual de SSO sem bloquear o MVP.

## Entitlements

Planos não devem ser codificados diretamente na UI. `entitlements` responde se um workspace possui uma capability:

```text
crm             active
collections     active
documents       active
growth          trial
voice            paused
```

A origem pode ser:

- `nexoffice`
- `nexjud`
- `mydatamed`
- `sindcopilot`
- parceiro futuro

Assim o mesmo usuário pode receber NexOffice como parte de um bundle ou contratar standalone sem diferenças no core.

## Vertical Pack

Vertical Packs nunca viram forks do NexOffice.

São adapters/configuração:

- nomes/labels;
- mapeamento de entidades;
- eventos;
- templates;
- políticas iniciais;
- automações permitidas;
- links de volta para o sistema vertical.

### Legal Pack

`case`, `process`, `hearing`, `legal_fee` continuam no NexJud. NexOffice enxerga somente referências e fatos horizontais necessários: cliente, reunião, recebível, documento, tarefa, evento.

### Health Pack

Prontuário e dados clínicos continuam MyDataMed. NexOffice opera agenda administrativa, relacionamento, documentos administrativos, cobrança e comunicação dentro dos limites de consentimento e necessidade.

### Condo Pack

Domínio condominial permanece SindCopilot; NexOffice assume operação horizontal.

### Commerce Pack

Integra lojas e marketplaces. Pedido/produto podem permanecer na plataforma de comércio; NexOffice centraliza cliente, relacionamento, atendimento, financeiro e growth.

## Regra de ouro

**Uma base NexOffice, vários pontos de entrada, nenhuma duplicação de capability.**
