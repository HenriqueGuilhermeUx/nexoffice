# Nexa — transição do antigo Nex Personal e acesso seguro à Nexa Wallet
**Data:** 24/10/2026  
**Código:** PR #86, branch isolada `feature/nex-personal-foundation-20261022`. **Sem merge, deploy, mudança de domínio ou ativação financeira.**

## Decisão de produto
- Nome público: **Nexa**, sem "Nex Personal" nas áreas visíveis principais. Nexa é o serviço completo de vida e finanças pessoais.
- Cripto: área própria **Cripto & Wallet**, com **Nico** no escritório 2D e no menu. É uma porta de entrada para a **Nexa Wallet**, não uma segunda implementação de carteira.
- Paleta: mesma identidade Nexa (#06111F navy, #218BFF blue, #31D7FF cyan), escopo CSS exclusivo da experiência PF; não altera o tema/rotas do NexOffices PJ.
- F-Insight, Maya e 11 agentes, organização financeira e privacidade continuam na mesma aplicação.
- Nome interno `nex_personal`, chave `nex.personal.token`, módulos e migrações continuam por compatibilidade. Não renomear banco de dados ou tokens para mudar o rótulo visual.
- Marca principal `trynexa.com.br` com seção institucional; app integral sob caminho reservado `/meu-espaco/` quando houver build e autenticação liberados; Wallet em `wallet.trynexa.com.br` somente após migração de domínio validada. Antes disso, acesso transacional permanece no `https://trynexa.com.br/portal/`.

## Reaproveitamento Privy & WalletConnect — não duplicar
Fonte original: `HenriqueGuilhermeUx/nexa-react-app` usa `useCreateWallet`, `useLoginWithEmail`, `usePrivy`, `useWallets` e a identidade Nexa; o vínculo no backend é validado com JWT Nexa + token Privy e se aplica aos perfis autorizados.

No novo painel `NexaCryptoHub.tsx`:
- Link explícito para **portal Wallet atual** `https://trynexa.com.br/portal/`; cadastro via `/cadastro`.
- Sem pedir credenciais, CPF, seed phrase, endereço, token ou conectar wallet no browser do Life OS; não há `useCreateWallet`, SDK Privy, WalletConnect ou assinatura nessa aplicação.
- Usuário com Wallet existente deverá recuperar a mesma wallet pelo login Nexa/Privy do portal original. Login PF neste protótipo é **independente** do JWT Wallet; não faz login na Wallet automaticamente.
- Carteiras externas MetaMask, Coinbase, Trust, Rabby etc ficam na implementação Wallet Connect em conclusão em frente separada. Esta PR não cria conexão concorrente.
- Entrada de USDC de wallets externas: taxa Nexa informada 0%, custos de rede/provedores separados; isso não libera envio, saída, Pix, swap ou ordens neste painel.
- Sem transferência de saldos da Wallet, KYC, ledger, chaves, permissões, Pix nem histórico entre bancos. Nenhum saldo Wallet é apresentado como saldo consolidado real sem consentimento/verificação.

## Plano de unificação de identidade **futuro e bloqueado**
1. Inventariar `user.id`, perfil PF, conta Nexa, `privyUserId`, `privyWalletId`, endereço e origens permitidas; **somente leitura**, nunca comparar por e-mail como autorização suficiente para conectar carteira.
2. Identificar mapping comprovado via login e tokens próprios, com audience e validade, sem confundir `nex.personal.token` e `nexa_access_token` do produto Wallet.
3. Implementar autorização explícita, revogável, com escopos mínimos `wallet.read` e `wallet.connect`; sem concessão implícita de `wallet.sign`, `transfer`, `pix`, `buy`, `sell`.
4. Para dados on-chain, separar rede, token, status confirmado e identificadores; blockchain é fonte de verdade da posição liquidada, ledger reconcilia e não duplica saldo gastável.
5. Conectar carteiras externas somente com consentimento e desafio de assinatura verificado; nenhuma captura de chave privada, seed phrase ou autorização de transferência prévia.
6. Se criar carteira via Privy, fazê-lo **apenas** dentro do login Wallet auditado, com OTP e verificação de elegibilidade; backend precisa comprovar que o usuário não tinha carteira antes.
7. Testes de regressão com cliente antigo, endereço idêntico, histórico idêntico, sem duplicação, sem mudanças de KYC ou saldo, sem assinatura silenciosa e sem execução financeira.
8. Por último, compatibilizar CORS, permitted origins Privy e nova URL `wallet.trynexa.com.br` com callback e web/mobile/PWA.

## Estado da infraestrutura e deploy
- Backend Nexa e operação Pix/USDC **intocados**; NEXA Wallet App, Nexa Brasil/Global, PR #172, NexOffice PJ, Render Wallet e Netlify atual **intocados**.
- Site institucional preparado em branch isolada `HenriqueGuilhermeUx/nexa-site`, PR **#24**: https://github.com/HenriqueGuilhermeUx/nexa-site/pull/24.
- Life OS permanece PR **#86**: https://github.com/HenriqueGuilhermeUx/nexoffice/pull/86. CI previa falhou sem runners (issue https://github.com/HenriqueGuilhermeUx/nexoffice/issues/89).
- Live PF Preview ainda contém o commit anterior `7ad828e33959442cb9b8a51d5949ff31e5ec9cbb`. Banco Neon PF isolado, sem migrações executadas nesta sprint.
- Novo módulo apenas de navegação e conteúdo; qualquer ativação de SSO, Pix, SDK wallet ou conexão bancária exige validação independente e publicação posterior.

## Gates para a publicação
- PR #86: CI e testes `scripts/smoke-nexa-brand-crypto.mjs`, `scripts/smoke-nex-personal-names.mjs`, toda integração PF; E2E desktop/mobile, ativação e logout.
- PR #24: build Netlify completo, validação de rotas, PWA/Service Worker, preservação de `/portal`, `/cadastro`, `/admin`, `/global`, `/pj`, `/api/v1/*`; conferir que o domínio Wallet ainda não está aliased e que o main atual segue intocado.
- Domain go-live: adicionar DNS/alias e verificar TLS, origens Privy e backend, cookie/localStorage isolation, autenticação antiga e recuperação da carteira **mesmo endereço** no host novo; só então atualizar CTAs ou redirecionamentos.
- Rollback: manter deploy atual Netlify, rota Wallet antiga, backend inalterado e PRs em DRAFT até confirmação. Não exigir reinstalação/limpeza de dados dos aplicativos.
