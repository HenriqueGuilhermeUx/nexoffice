# NexOffice

**O sistema operacional do seu negócio.**

NexOffice é a camada operacional horizontal da Alternative Ventures: CRM, agenda, documentos, financeiro, cobrança, atendimento, automações, agentes de IA e growth em uma única Central de Comando.

Ele nasce para funcionar de três formas:

1. **Standalone** — uma empresa pode contratar somente NexOffice.
2. **Add-on** — clientes de NexJud, MyDataMed, SindCopilot e outras ventures podem ativá-lo dentro do produto que já usam.
3. **Platform capability** — outros produtos AV consomem serviços do NexOffice por API/eventos.

## Princípios

- Um workspace representa um negócio.
- Uma pessoa/empresa tem uma identidade comercial única no CRM.
- ERP registra fatos; agentes interpretam e executam ações permitidas.
- Toda automação tem política explícita de autonomia: `automatic`, `notify` ou `approval_required`.
- Capabilities existentes da AV são reutilizadas por adapters, não reimplementadas.
- Uso e custo são medidos desde o primeiro evento.
- NexOffice é horizontal; regras específicas vivem em Vertical Packs.

## Arquitetura

```text
NexOffice
├── Workspace Core
├── CRM Core
├── ERP Lite / Business Ledger
├── Agenda & Tasks
├── Command Center
│   ├── Event Bus
│   ├── Action Inbox
│   ├── Approval Engine
│   └── Agent Orchestrator
├── Usage Metering
├── Integration Hub
│   ├── DocWallet
│   ├── SmartBots
│   ├── Staff
│   ├── NextGen
│   ├── MODO
│   └── TaxAgent
└── Vertical Packs
    ├── Legal / NexJud
    ├── Health / MyDataMed
    ├── Condo / SindCopilot
    └── Commerce
```

## Monorepo

- `apps/api` — API/backend NexOffice.
- `apps/web` — Central de Comando e módulos operacionais.
- `packages/domain` — tipos e regras centrais.
- `packages/integrations` — contratos e adapters das capabilities AV.
- `packages/ui` — componentes compartilhados.
- `infra` — schema, migrations e deploy.
- `docs` — arquitetura, produto e decisões.

## Estado

Projeto em construção. A primeira versão implementa a fundação multi-tenant, CRM, ERP Lite, Command Center, eventos, aprovações, agentes, metering e contratos de integração.
