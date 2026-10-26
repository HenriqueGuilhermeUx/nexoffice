# Nexa Life OS — rota principal /meu-espaco/app/ (preparação, sem corte de produção)

Data: 26/10/2026 | Base da implementação: branch isolada derivada da PR #86 (Nexa PF).
Ver também [nexa-site#35](https://github.com/HenriqueGuilhermeUx/nexa-site/issues/35) e [nexa-site#25](https://github.com/HenriqueGuilhermeUx/nexa-site/issues/25).

## Produto e domínios definitivos
- `https://trynexa.com.br`: **Nexa**, antiga Nex Personal, principal Life OS PF, mesma marca e cores da Nexa.
- `https://trynexa.com.br/meu-espaco/app/`: caminho preparado para a experiência PF completa, **não publicado** e sem backend de produção ainda.
- `https://wallet.trynexa.com.br`: **Nexa Wallet** com Privy/PIX/USDC, sem duplicação de carteiras. Os links de login da Wallet seguem redirecionados ao domínio anterior enquanto a origem Privy não for liberada.
- NexOffices PJ permanece com build, dados e favicon independentes.

## O que está implementado nesta branch
- Vite ganha `base:'/meu-espaco/app/'` **somente em modo explicitamente ativado**. Sem variável, o build NexOffices/PJ é o mesmo.
- `apps/web/src/main.tsx` monta o Life OS apenas em release mode. O modo `verify` renderiza uma página inerte e não usa login, tokens, APIs ou movimentações.
- A futura build PF usa `VITE_NEXA_LIFEOS_API_URL` e chave `sessionStorage` exclusiva `nexa.life.session.v1`; a homologação existente continua no token `nex.personal.token` e backend atuais.
- `scripts/build-nexa-lifeos-path.mjs` gera a build com HTML/Nexa logo/canonical/asset paths corretos e `robots noindex`. Bloqueia release se `NEXA_LIFEOS_PROD_RELEASE_APPROVED` não for `true` ou API for host Wallet, Nexa antigo, Render preview, localhost, .invalid/.example/.test ou outro endereço sem HTTPS.
- `scripts/smoke-nexa-lifeos-public-path.mjs` testa separação de configuração e artefato; CI recompila modo `verify` e exige falha do modo `release` sem autorização.
- Nenhuma dessas mudanças muda Netlify ou Render de produção; `apps/web/dist` é saída efêmera de compilação e não é publicado.

## Comandos de verificação sem backend
```bash
node scripts/build-nexa-lifeos-path.mjs
node scripts/smoke-nexa-lifeos-public-path.mjs
NEXA_LIFEOS_PATH_BUILD=verify node scripts/build-nexa-lifeos-path.mjs
NEXA_LIFEOS_CHECK_DIST=true node scripts/smoke-nexa-lifeos-public-path.mjs
```

## Riscos de origem única / gates obrigatórios
1. **Service Worker Wallet raiz**: `trynexa.com.br/sw.js` é registrado no escopo `/`. Atualmente intercepta navegações e arquivos estáticos `.js/.css/.svg` de QUALQUER rota same-origin (cache-first para assets). Antes de colocar o PF em `/meu-espaco/app/`, revisar e isentar EXPLICITAMENTE esse prefixo do SW Wallet, validar browsers com instalações antigas e estratégia de cache PF própria. Não substituir `sw.js` nem `manifest.webmanifest` sem QA.
2. **Sessão/credenciais**: nomes diferentes em sessionStorage ajudam a evitar colisões acidentais, **não constituem isolamento de segurança entre scripts de duas aplicações no mesmo origin**. Validar CSP estrita, proteção anti-XSS, audience de JWT, autorização por backend, cookies/CSRF, logout e limites de acesso PF x Wallet. Idealmente usar sessões HttpOnly com políticas e serviços separados, após revisão.
3. **Backend e DB PF próprios de produção**: não usar `nex-personal-preview-api.onrender.com`, `nexa-backend-p2u0.onrender.com`, `/api/v1/*` da Wallet ou DB Neon de homologação. Provisionar com migrations, backup, observabilidade e políticas LGPD.
4. **Fluxo público**: implementar autenticação PF própria/SSO formal, consentimentos, elegibilidade e privacidade. Não criar carteira Privy nem compartilhar o token PF para Wallet.
5. **Netlify**: só depois da homologação, criar rewrites estáticos para `/meu-espaco/app/` e os assets com estratégia de deploy versionada; manter `/app`, `/portal`, `/login`, `/cadastro`, `/api/v1`, Admin, Global e PWA Wallet antigos. Testar preview, desktop/mobile, links internos e rollback ANTES de publicar CTA.
6. **SEO**: `noindex` no build de verificação e na primeira liberação controlada; remover apenas após publicação real e revisão de indexação/canonical.

## Evidência do estágio
- Build de verificação local (sem backend) funciona com os bundles prefixados, favicon Nexa, sem login e sem fetch financeiro.
- Condições negativas simuladas (release sem aprovação, release usando API da homologação, release usando apex Nexa/Wallet) são rejeitadas.
- Esta entrega **não equivale à liberação pública** do Life OS, não usa dados de usuários e não interfere na PR #86 nem nos deploys atuais.
