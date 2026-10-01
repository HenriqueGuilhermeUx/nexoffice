# Knowledge & Security V1

## Objetivo

Adicionar ao NexOffice capacidades simples e úteis de memória empresarial e proteção de dados sem transformar o produto em um repositório de arquivos brutos, um cofre de credenciais de storage ou mais um chat genérico.

## Pergunte à empresa

`POST /v1/intelligence/ask`

O V1 é retrieval-first e determinístico. Ele consulta somente informações estruturadas que o membro já pode ler:

- CRM e oportunidades, quando há `crm.read`;
- financeiro, quando há `finance.read`;
- agenda e tarefas, quando há `agenda.read`;
- referências documentais + inteligência estruturada DocWallet, quando há `documents.read`.

A resposta sempre informa fontes e confiança. Se não houver evidência suficiente, o motor declara contexto insuficiente.

### Limites de privacidade

- nenhum arquivo bruto é copiado da DocWallet;
- nenhum raw OCR/texto integral é armazenado no NexOffice;
- nenhuma chave de LLM externo é necessária;
- V1 não usa embeddings nem geração externa;
- nenhuma pergunta executa ação.

## Backup empresarial

O NexOffice é o painel de visibilidade do backup, não o destino dos bytes.

O agente `tools/nexoffice-backup-agent.mjs` roda no computador/servidor da empresa e invoca o Restic instalado localmente. O cliente mantém localmente:

- `RESTIC_REPOSITORY`;
- `RESTIC_PASSWORD_FILE`;
- credenciais S3/B2/SFTP/etc.;
- caminhos reais que serão protegidos.

O NexOffice recebe apenas:

- heartbeat do agente;
- versão Restic e plataforma;
- status da execução;
- snapshot ID;
- contadores de arquivos;
- bytes adicionados;
- resultado de `restic check`.

O token de pairing é exibido uma única vez e somente seu hash é persistido no banco.

### Sem execução remota no V1

O agente é one-shot e deve ser agendado pelo sistema operacional do cliente. O NexOffice não envia comandos para dentro da máquina.

## O que mudou?

O Briefing Executivo recebe um digest de 24 horas com:

- tipos de eventos operacionais agregados;
- referências documentais atualizadas;
- status de execuções de backup.

O digest não inclui payloads integrais de eventos, conteúdo bruto de documentos ou arquivos de backup.
