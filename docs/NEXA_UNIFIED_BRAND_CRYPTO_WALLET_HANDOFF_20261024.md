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

## Atualização de execução — 25/10/2026 (substitui o status histórico de 24/10)

**A marca e o site principal foram publicados**, preservando Wallet e clientes:
- `trynexa.com.br/`: Nexa unificada; `/meu-espaco`: apresentação do Life OS por convite; `/wallet`: landing Wallet antiga; `/portal`: portal legado dos clientes.
- `wallet.trynexa.com.br`: DNS/TLS/landing ativos. Autenticação e PWA **não liberados no novo host**. As rotas de login, cadastro, recuperação de senha, React Portal e `wallet-v148.html` redirecionam provisoriamente por **HTTP 302** ao domínio original. A landing nova não anuncia manifesto nem registra SW na origem ainda não homologada.
- O último deploy publicado e verificado do site anterior à presente atualização era `6ade994cab7b7df5489d7589` (`nexa-site`, SHA `b29a31542364510a6ea7589ae557449ad239a044`). As mudanças subsequentes são acompanhadas na issue #25 do `nexa-site`; não inferir liberação de Wallet a partir do HTTP 200.
- Consulta somente leitura ao app público Privy `cmpen2gm3007v0cjswjlyefji` confirmou que `https://wallet.trynexa.com.br` **não está em `allowed_domains`**. O React Privy no novo domínio também havia recebido `403`/CSP antes do fallback. Check automatizado em PR #34 do `nexa-site`; **a ação administrativa no dashboard Privy ainda é necessária**. A falta de origem autorizada impede SSO/migração.
- Life OS isolado `nex-personal-preview-api.onrender.com` está LIVE no commit `95ea8f8faee5f84278ec5d70de170ed6df52c6a4` (`dep-dbf75ndg1s2s73enput0`), com allowlist e código de convite. Banco de testes dedicado, sem migração de Wallet/cliente. Esta branch/PR #86 permanece draft; atualizações mais novas do código necessitam CI verde e novo deploy **somente no preview**.
- A tela de login do Life OS em homologação agora informa explicitamente que **contas de teste não usam as credenciais da Wallet** e oferece link ao portal oficial. Essa separação não será necessária como experiência final quando houver SSO homologado; não criar SSO implícito.
- Não houve alteração nos usuários Wallet, carteira Privy, `privyWalletId`, `walletAddress`, saldos, KYC, Pix/USDC, tesouraria ou ledger. Nenhuma liberação de cliente no domínio Wallet será realizada sem testar a mesma identidade e endereço de carteira já existente.

**Ordem da próxima liberação:** autorização de origem no mesmo Privy App → consulta pública `allowed_domains` positiva → teste anônimo de iframe sem 403/CSP → E2E de usuário já existente e mesma carteira → plano de rollback → revisão independente dos 302 e da instalação PWA. A PR #86 do Life OS não precisa esperar essa migração para continuar evoluindo em homologação.

## Diretriz definitiva de produto, marca e domínios — 25/10/2026

**Esta seção prevalece sobre as notas históricas acima, que registram o estágio de migração de 24/10.**

| Produto público | Domínio principal/objetivo | Experiência |
| --- | --- | --- |
| **Nexa** (antigo “Nex Personal”, expressão apenas histórica) | **`https://trynexa.com.br`** | Plataforma principal PF/Life OS: Maya, agentes, salas, finanças, planejamento, documentos, decisões, F-Insight e área de acesso à Wallet |
| **Nexa Wallet** | **`https://wallet.trynexa.com.br`** | Serviço cripto específico: autenticação Privy existente, saldos, Pix ↔ USDC, cripto, transações, carteiras externas, KYC e histórico |
| **Nexa PJ** | Experiência empresarial própria | Não confundir com PF Life OS e não alterar a experiência PJ do NexOffices nesta PR |

**Uma única identidade visual** — símbolo oficial de Nexa igual ao SVG existente em `HenriqueGuilhermeUx/nexa-site/icon.svg`, armazenado em `apps/web/public/nexa-logo.svg` da experiência Life OS; cores navy `#06111F`, blue `#218BFF`, cyan `#31D7FF`. As quatro superfícies visuais de identificação do Life OS usam o mesmo símbolo SVG, não “N” genérico. A build isolada da homologação usa `/nexa-logo.svg` também em `rel=icon` e `shortcut icon`; o `apps/web/index.html` e o `apps/web/public/favicon.svg` do NexOffices PJ continuam inalterados.

**Situação efetiva:** `trynexa.com.br/` publica a homepage institucional Nexa e `/meu-espaco` apresenta o Life OS; o **aplicativo PF completo** ainda está no Render de homologação `nex-personal-preview-api.onrender.com`, por convite, em branch/DB separados. Isto **não é o cutover concluído** do app PF para o domínio raiz. O domínio `wallet.trynexa.com.br` serve a landing cripto, mas seus caminhos de login/cadastro/PWA redirecionam temporariamente a `trynexa.com.br` devido à falta da origem na allowlist Privy.

**Próxima entrega para operar o Life OS realmente em `trynexa.com.br`:** projetar publicação estável do frontend PF sob rota proprietária do domínio principal, com backend e banco de produção PF exclusivos, cookie/audience/sessão separados do Wallet, migrações revisadas, permissões, consentimento, segurança, E2E e rollback. Não usar banco de homologação com dados reais, não compartilhar JWT PF com a Wallet e não publicar redirects/proxy financeiro por tentativa e erro. Só ligar a rota final ao produto após testes e aprovação explícita de corte de produção. A home `/` poderá continuar como apresentação comercial com entrada clara para o app PF, sem confundir `/portal` que é acesso legado da Wallet.

**Não permitir rebranding de volta:** nomes internos `NexPersonal`, `nex_personal`, `nex.personal.token` ficam por compatibilidade, mas cópias visíveis não devem usar “Nex Personal”. O código de login PF (preview) não cria carteiras Privy ou move saldos; seu link para `trynexa.com.br/portal` é um handoff sem credenciais. A identidade Wallet e o endereço on-chain dos clientes jamais são substituídos por essa unificação de marca.
