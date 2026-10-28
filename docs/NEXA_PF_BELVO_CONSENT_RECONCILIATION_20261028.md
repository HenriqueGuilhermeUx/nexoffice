# Nexa PF — Belvo sandbox: revogação, expiração e reconciliação

28/10/2026. Continuação isolada da beta PF: nenhuma conta real, saldo, Pix, Wallet, Privy ou PJ foi modificada.

## Problema
Um `verified_authorized` armazenado após uma consulta à Belvo representa uma **observação passada**, não uma autorização permanente. A Belvo pode notificar revogação, expiração, alteração de prazo e recursos indisponíveis; webhooks de CONSENT frequentemente trazem `external_id: null`.

## Solução implementada
- Migração 052: estado `needs_reverification`, razão resumida e carimbo do último aviso na tabela de provas sandbox. A prova é considerada **recente por apenas 15 minutos** para exibição informativa. Não concede nenhuma leitura de dados financeiros, nem depois da confirmação.
- Webhook com Bearer previamente configurado e ID de evento único: se houver `external_id`, associa somente à tentativa da Nexa PF correspondente. Sem `external_id`, exige vínculo **já verificado no servidor** que corresponda exatamente ao `link_id`; eventos desconhecidos continuam ignorados.
- Para avisos críticos conhecidos de consentimento (`consent_rejected`, `openfinance_consent_expired`, `openfinance_consent_about_to_expire`, `openfinance_consent_expiration_changed`, recursos irrecuperáveis/temporariamente indisponíveis) e `invalid_credentials` no vínculo, a prova é **suspensa**, nunca reativada por webhook.
- `GET /v1/personal/belvo-sandbox/status`: exige sessão PF por convite, retorna apenas `not_verified`, `verified_recent`, `verification_stale` ou `review_required` com data de verificação, sem identificar conta bancária nem mostrar saldo.
- `POST /v1/personal/belvo-sandbox/verify`: ação explícita com sessão PF que reconfirma no servidor o link/consentimento junto à Belvo. Vínculo que já havia sido verificado pode ser revalidado além das 48 horas iniciais. Prova negativa suspende a observação anterior. Prova positiva atualiza `verified_at` e a referência de consentimento para o **mesmo** vínculo e proprietário, sem importar dados bancários.
- Na visão Nexa PF Premium, os estados `review_required` e `verification_stale` são claramente distinguíveis. Nada é exibido como conta, investimento ou saldo confirmado.
- Testes de revogação, ausência de `external_id`, duplicidade, ausência de permissão, expiração e titularidade continuam no CI.

## Regra de segurança antes de ativar
O mockbank OFDA segue desativado por padrão: `BELVO_SANDBOX_WIDGET_ENABLED` não deve ser ativado antes de termos **identidade fictícia oficial do mockbank**, termos públicos HTTPS e **Bearer dedicado no webhook de Data Aggregation da Belvo e no Render**, além do teste E2E. Não inventar CPF, não reutilizar bearer da Nexa PF ou Wallet, não compartilhar chaves.

## Limites
Um webhook, mesmo autenticado, não autoriza investimentos ou conta; pode apenas pedir nova verificação. A presença de uma prova recente sandbox também **não representa um consentimento de produção**. A produção PF continua bloqueada por exigências de identidade, RLS, banco exclusivo e consentimento regulatório; o `main` PJ não é tocado.

Fonte técnica: [Belvo aggregation webhooks](https://developers.belvo.com/pt-br/developer_resources/resources-webhooks-aggregation) e [consents](https://developers.belvo.com/pt-br/apis/belvoopenapispec/consents/consents).
