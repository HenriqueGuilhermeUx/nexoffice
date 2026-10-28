# Nexa PF · verificação server-to-server de vínculo e consentimento Belvo (sandbox)

Data: 28/10/2026. Complementa PR #111 sem ativar Open Finance real, Pix ou Wallet.

## Problema resolvido
O retorno do Hosted Widget e o webhook de agregação são avisos, **não comprovantes** de titularidade, consentimento válido ou autorização para sincronizar saldos. Um evento pode ter `external_id=null` (especialmente webhooks de consentimento), pode ser duplicado ou se referir a um vínculo de outra pessoa. Não se deve confiar em um `link_id` fornecido pelo navegador.

## Fluxo efetivamente implementado
1. O testador da beta PF usa a ação explícita **Verificar consentimento**. A API `POST /v1/personal/belvo-sandbox/verify` recebe apenas `{"confirmSandbox":true}`; não aceita CPF, link ID nem owner ID do navegador.
2. O backend autentica sessão PF, verifica e-mail na lista de convites e perfil ativado. Só seleciona eventos recebidos para tentativas com `owner_user_id` igual ao usuário autenticado, status `widget_ready`, e período de até 48 horas.
3. O backend consulta `GET https://sandbox.belvo.com/api/links/{link_id}/` com Basic Auth **somente no servidor** e rejeita link cujo ID, `external_id` aleatório, instituição `ofmockbank_br_retail` ou status `valid` não corresponda.
4. Com essa correlação, consulta `GET https://sandbox.belvo.com/api/consents/?user_document=<CPF_FICTICIO>&page_size=1000`, nunca CPF de cliente. Rejeita paginação incompleta, respostas malformadas e qualquer consentimento com `link_id` diferente, instituição errada, documento diferente, status diverso de `AUTHORISED`, prazo expirado ou ausência da permissão `ACCOUNTS`. Consentimento indefinido só é aceito quando `undefined_consent_expiration=true` e `expired_at=null`.
5. Só então registra referências técnicas de prova na nova `nex_personal.belvo_sandbox_verified_consents`, via inserção ligada ao usuário e tentativa, com `ON CONFLICT DO NOTHING`. A tabela não guarda saldo, CPF, token, documento, investimento ou credenciais.
6. A interface mostra **"Consentimento do banco fictício confirmado"** e **"Nenhum saldo foi importado"**, distinguindo verificação de permissão de efetiva ingestão bancária.

## Limites de segurança
- `BELVO_SANDBOX_WIDGET_ENABLED` permanece desativado até haver configuração completa de identidade fictícia, termos HTTPS e `BELVO_SANDBOX_WEBHOOK_BEARER`. O botão não pode alcançar banco real quando desativado.
- Não há autorização real de banco, busca de contas, transações, investimentos, passivos ou ordens. A prova pertence somente à sandbox; **NÃO** habilita saldo verificado de produção, sync, Agentics financeiro, Pix, trading ou Privy.
- O webhook exige Bearer e só cadastra eventos com `external_id` válido e tentativa conhecida. Eventos com ID externo ausente permanecem descartados por enquanto; se for necessário correlacioná-los posteriormente, isso exigirá regra explícita auditada.
- O verificador é chamado por ação do usuário; nenhum worker ou gatilho de webhook consulta a Belvo automaticamente.
- Respostas de terceiros nunca são registradas em logs; consultas usam domínio fixo, HTTPS, `redirect:error`, timeout e somente GET.
- Não usar dados de mockbank em `nex_personal.accounts` ou métricas financeiras da Visão Completa.

## Próximo incremento
Se/Quando a configuração da mockbank for homologada: testes E2E com evento genuíno do provider, verificação do consentimento por usuário, tratamento de expiração/revogação e exportação de relatórios de teste marcados `sandbox_demo` — sem somar com saldos reais. Investimentos, cartões e dívidas exigem suporte verificado para cada recurso.

Referências:
- Belvo links: https://developers.belvo.com/apis/belvoopenapispec/links
- Belvo consents: https://developers.belvo.com/apis/belvoopenapispec/consents
- Belvo webhooks: https://developers.belvo.com/pt-br/developer_resources/resources-webhooks-aggregation
