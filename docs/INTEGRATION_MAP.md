# Integration Map — Alternative Ventures

| NexOffice capability | Engine/origem | Contrato V1 | Dados que retornam ao NexOffice |
|---|---|---|---|
| Documentos | DocWallet | createEnvelope, requestApproval, extractDocument, getDocumentStatus | refs, status, metadados, eventos |
| Atendimento | SmartBots | sendMessage, suggestReply, qualifyLead, startFollowUp | conversa, canal, qualificação, eventos |
| Voz/Comando/Agenda | Staff | understandCommand, transcribe, schedule, remember | intent, agenda refs, transcrição, memória permitida |
| Cobrança/Pagamentos | NextGen | createCharge, getCharge, reconcile | charge ref, status, Pix/link, liquidação |
| Growth | MODO | createCampaignBrief, publishCampaign, getPerformance, createContent | campanha ref, conteúdo, performance |
| Fiscal | TaxAgent | issueServiceInvoice, getInvoice | invoice ref, status, número/PDF ref |

## Fronteiras

### NexOffice é dono de
- workspace e identidade empresarial;
- CRM horizontal;
- ledger operacional;
- Action Inbox;
- aprovações/autonomia;
- agentes e orquestração;
- metering;
- referências de integrações.

### NexOffice não deve duplicar
- armazenamento/assinatura documental completo do DocWallet;
- infraestrutura conversacional/canal do SmartBots;
- motor de voz pessoal da Staff;
- rails de pagamento da NextGen;
- motor de campanhas do MODO;
- engine fiscal do TaxAgent;
- domínio jurídico do NexJud;
- domínio clínico do MyDataMed;
- domínio condominial do SindCopilot.

## Contrato de eventos recomendado

Cada adapter externo deve converter eventos próprios para nomes NexOffice, preservando o payload original dentro de `payload.provider` quando necessário.

Exemplos:

- DocWallet → `document.signed`
- SmartBots → `conversation.message_received`
- Staff → `appointment.created`
- NextGen → `payment.received`
- MODO → `campaign.performance_changed`
- TaxAgent → `invoice.issued`

Essa tradução mantém o core independente da implementação atual de cada venture.
