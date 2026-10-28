# Nexa PF + Nexa Wallet — duas experiências, um núcleo Agentics

Decisão de produto (27/10/2026): **Maya** coordena a Nexa PF; **Assistente Nexa** atua apenas dentro da Wallet. `Nexa Agentics` é o conjunto reutilizável de políticas, planejamento e capacidades, **não** uma sessão única nem um banco de dados compartilhado.

## Entrega P0 neste branch
- Página Maya da Nexa PF recebe um encaminhador **local e determinístico** para os 11 especialistas já presentes. A caixa de texto não chama um modelo nem um endpoint, não guarda o pedido e não passa dados para a Wallet.
- Palavras sobre Pix, USDC, carteira ou transferências direcionam ao módulo informativo Cripto & Wallet; a navegação abre o produto Wallet separadamente.
- Ferramentas e resultados existentes são preservados. Maya não executa ações externas.
- A Wallet tem interface própria (**Assistente Nexa**) e contratos em [nexa-backend1 PR #195](https://github.com/HenriqueGuilhermeUx/nexa-backend1/pull/195), sobre a revisão sanitizada #185. A ponte existente no backend continua bloqueada em produção.

## Fronteira de autorização — obrigatória
| Ação | Maya PF | Assistente Wallet |
|---|---|---|
| Navegar e abrir especialistas | Sim, local | Dentro da Wallet |
| Ler gastos ou metas PF | Apenas via API PF autenticada | Nunca por padrão |
| Ler saldo, histórico, recompensas Wallet | Nunca por token PF | Apenas identidade Wallet + permissão real |
| Preparar Pix, swap, USDC | Não | Não disponível nesta etapa; requer Trust + Premium real + preflight |
| Assinar, pagar, investir, transferir | Não | Nunca sem etapa própria, aprovação expressa e execução segregada |
| Transferir token, CPF ou wallet address entre experiências | Não | Não |

O usuário não escolhe `ownerId` nem capacidades no payload de agente. O servidor autentica o principal e consulta os entitlements na fonte de verdade, nunca na UI ou em parâmetros enviados pelo browser. Nenhum cookie ou bearer PF é aceito como token Wallet.

## Próximas entregas funcionais, em ordem
1. P0 **já implementado neste branch**: Maya abre o especialista certo no aplicativo PF, sem quebrar beta.
2. P1: conectar Maya aos agentes PF via API própria e identidade PF autenticada, com respostas contextualizadas, consentimento e limite de dados, sem efeitos financeiros; `Nexa Agentics` reaproveita bibliotecas/políticas, não o banco ou a sessão Wallet.
3. P1 Wallet: usar a ponte autenticada do Assistente somente com dados Wallet autorizados e Premium verificado no servidor; habilitação independente das contas PF.
4. P2: se o cliente solicitar explicitamente ligação PF↔Wallet, desenhar autorização de propósito limitado, tokens de troca de uso único, retenção mínima, auditoria, revogação e roteamento server-to-server. Sem copiar saldos da Wallet para a PF por padrão.
5. P3: Trust de ações supervisionadas na Wallet após aprovação legal/regulatória, reconciliação, idempotência e step-up; não transformar orientação em autorização de Pix/USDC.

## Publicação e compatibilidade
- Produto principal: `trynexa.com.br` (Nexa PF).
- Wallet: `wallet.trynexa.com.br`, com acesso original e Privy preservados enquanto a migração de origem estiver bloqueada.
- Não mudar o PWA root, Netlify redirects, endpoint de login Wallet, projeto Privy, nem clientes ou ledgers da Nexa.
- Este branch tem como base a PR #86 da PF, não a PR #103 de RLS/produção. Continua DRAFT/sem merge/deploy. **Não afirmar que o Agentics backend já está integrado à Maya:** neste P0 o roteamento é local e a ferramenta final permanece a já existente.
