# NexOffice Commercial V1 — Closure

Status: homologação. **Não é autorização de merge nem de produção.**

## Tese de produto

Uma empresa inteira. Um NexOffice.

O cliente deve conseguir usar o NexOffice como o ponto central do dia a dia da empresa: entender o negócio, atender clientes, vender, organizar trabalho, cuidar de documentos, emitir nota, cobrar, receber, acompanhar dinheiro, crescer e pedir apoio aos Agents.

Engines especializados permanecem por trás da experiência. Nomes de provider, secrets, contratos internos e detalhes de infraestrutura não são linguagem de cliente.

## Jornada comercial que precisa passar antes do lançamento

Cliente → Oportunidade → Documento/Contrato → Trabalho/Tarefa → Nota → Cobrança Pix → Pagamento → Conciliação → Resultado → Agents → Crescimento.

A Commercial V1 só fecha quando essa jornada puder ser executada no mesmo workspace sem workaround manual entre produtos.

## Capacidades essenciais

- Clientes e CRM: contatos, oportunidades, pipeline e próximos passos.
- Operação: agenda, tarefas e prioridades.
- Financeiro: ledger, receitas, despesas, recebíveis e visão de caixa.
- Cobrança e Pix: conta de recebimento, criação governada de cobrança, código Pix, status e conciliação.
- Documentos: upload, contrato, inteligência, assinatura eletrônica e caminho ICP-Brasil.
- Fiscal: preparação governada de NFS-e e acompanhamento dentro de Financeiro.
- Crescimento: estratégia, criativo, revisão, aprovação, mídia/leads e aprendizado.
- Agents: Maya, Theo, Dora, Clara, Nico e Sofia usando contexto real do workspace.

## Capacidades complementares

- SmartBots / WhatsApp.
- F-Insight em modo estritamente informativo.
- Office View como segunda experiência opcional.

## Gates de infraestrutura do homolog

O API homolog deve ter, quando aplicável, as seguintes configurações server-side. Nunca expor os valores no frontend, em logs de aplicação ou em documentação pública.

### Core de pagamento
- `NEXOFFICE_PAYMENT_DATA_KEY` — segredo próprio do ambiente, mínimo 24 caracteres; necessário para criptografia de dados de pagamento.
- NextGen já deve estar apontado para o homolog e ações externas permanecem governadas por aprovação humana.

### Documentos
- `DOCWALLET_BASE_URL`
- `DOCWALLET_SERVICE_KEY` ou `DOCWALLET_API_KEY`
- No serviço DocWallet homolog, `ICP_SIGNATURE_API_KEY` quando o fluxo ICP-Brasil for validado.

### Crescimento
- `MODO_BASE_URL`
- `MODO_API_KEY`

### Agents avançados
- `NEXOFFICE_STAFF_BRIDGE_ENABLED=true`
- `STAFF_BASE_URL`
- `STAFF_API_KEY`

### Atendimento
- `SMARTBOTS_BASE_URL`
- `SMARTBOTS_API_KEY`
- vínculo do bot por workspace.

### Fiscal
- `TAXAGENT_BASE_URL`
- `TAXAGENT_API_KEY` como fallback do ambiente, ou secret server-side referenciado pelo workspace.
- Company TaxAgent vinculada ao workspace.

### Inteligência de mercado financeiro
- `FINSIGHT_BASE_URL`
- `FINSIGHT_SERVICE_KEY`
- somente leitura/cálculo informativo; sem recomendação, ranking, buy/sell signal ou execução.

## Régua de lançamento

Usar `GET /v1/launch-readiness` e a tela **Integrações → Prontidão do NexOffice** como fonte de verdade. Um item não fica verde só porque existe UI ou código: precisa estar utilizável para o workspace e, quando externo, com configuração/health compatíveis.

Antes do lançamento executar smoke real da jornada completa com valores de baixo risco em homologação e registrar evidência de:

1. criar/usar cliente;
2. mover oportunidade;
3. criar/upload de documento;
4. criar tarefa/compromisso;
5. preparar nota fiscal sem emissão automática;
6. preparar, aprovar e gerar cobrança Pix;
7. reconciliar pagamento;
8. verificar reflexo no financeiro;
9. consultar Agents sobre o mesmo contexto;
10. preparar conteúdo/campanha em Crescimento com aprovação humana.

## Regra de parada

Quando as capacidades essenciais estiverem verdes e o smoke transversal passar, parar desenvolvimento de escopo da Commercial V1. A partir daí: hardening, primeiros clientes, correção de defeitos e coleta de evidência comercial.
