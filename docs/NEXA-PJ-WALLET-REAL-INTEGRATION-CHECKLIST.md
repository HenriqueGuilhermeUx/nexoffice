# Nexa PJ — integração real da Wallet (V1)

## Estado verificado
- Nexa Wallet backend `HenriqueGuilhermeUx/nexa-backend1` (`main`) expõe `GET /wallet/my-privy`, `GET /wallet/balance`, `GET /wallet/address` em `src/modules/wallet/wallet.controller.ts`.
- Esses endpoints usam `AuthGuard` e identificam o **usuário** via `req.user.id/sub`. Eles **não** demonstram vínculo de carteira com pessoa jurídica ou workspace NexOffice.
- O fluxo legado `POST /wallet/link-privy` está explicitamente desabilitado e instrui o fluxo Privy autenticado em `direct-settlement/wallet/link`.
- Nunca consumir esses endpoints no frontend PJ usando credenciais pessoais, nem usar um endereço igual como prova de representação empresarial.

## Contrato para V1 funcional, sem movimentações
1. No backend Nexa Wallet, estabelecer vínculo persistente e auditável entre identidade PJ aprovada, representante habilitado, wallet account e workspace corporativo. Validar identidade e autoridade por fonte interna confiável; evitar confiar em IDs enviados pelo navegador.
2. Implementar uma verificação backchannel mTLS ou credencial restrita + assinatura, com nonce, audience, expiry e replay prevention. Retornar prova vinculada ao mesmo workspace/representante/empresa/carteira/rede.
3. No backend NexOffice PJ, usar somente o resultado verificado do backchannel (`nexa-pj-wallet-binding.ts`) e nunca um payload do browser como evidência. Habilitar consulta read-only de saldo/extrato apenas para vínculo aprovado; negar a falta de prova, inconsistências, expiração, erro de rede ou revogação.
4. No frontend, renderizar endereço, rede, saldo e histórico exclusivamente quando o endpoint PJ authenticated retornar status verified; mostrar estado pendente/sem carteira em todos os outros casos.
5. Adicionar smoke tests cross-tenant, PF→PJ, representante revogado, replay, timeouts, dinheiro não iniciado e auditoria. Deploy com feature flag OFF até homologação; nenhuma transferência ou criação automática.

## Próxima entrega objetiva
Implementar o endpoint interno no backend Wallet + testes, preservar a branch independente do NexOffice e fazer homologação ponta a ponta sem transferências. Belvo e Agentics não fazem parte do bloqueio da V1.
