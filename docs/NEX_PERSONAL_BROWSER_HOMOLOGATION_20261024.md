# Nex Personal — matriz de homologação em navegador
**Data:** 24/10/2026  
**Escopo:** PR #86, branch `feature/nex-personal-foundation-20261022`, ambiente PF isolado.  
**Estado deste documento:** plano de validação, **não** evidência de teste visual concluído.

## Condições antes de testar

1. Registrar SHA exato da PR e SHA publicado no Render. Não supor que sejam iguais.
2. Exigir GitHub CI completo (build e integração) aprovado para o SHA que se quer homologar.
3. Usar apenas o endereço isolado `https://nex-personal-preview-api.onrender.com/`, usuários fictícios autorizados pela allowlist e convites de teste entregues por canal seguro. Não inserir códigos, tokens, CPFs ou senhas no relatório.
4. Não usar contas de clientes reais nem conectar NexOffices PJ, Nexa Wallet, saúde, jurídica ou instituições financeiras.
5. Capturar evidências sanitizadas: navegador/versão, viewport, resultado, screenshot sem dados pessoais, erro de console redigido, commit.
6. Falhas bloqueantes não autorizam merge ou deploy automático. O deploy de homologação é manual.

## Matriz de aceitação

| ID | Área | Passo em navegador real | Esperado |
|---|---|---|---|
| E2E-01 | Abertura | Abrir a URL na aba anônima, desktop e celular | HTML, JS e CSS carregam; sem tela vazia ou erro fatal de console |
| E2E-02 | Convite | Tentar cadastrar e-mail fora da allowlist e convite incorreto | Cadastro negado sem revelar credenciais ou dados |
| E2E-03 | Cadastro/login | Registrar apenas testador permitido; entrar, recarregar e sair | Fluxo concluído, navegação disponível, logout local imediato |
| E2E-04 | Sessão | Simular falha transitória da API e depois reconexão | Token da aba preservado, opção de tentar novamente, sem logout falso |
| E2E-05 | Privacidade | Abrir em dois testadores de homologação, separando sessões | Nenhum saldo, extrato, preferência ou exportação de outro titular |
| E2E-06 | Escritório | Abrir cada um dos 16 cartões (incluindo Cripto & Wallet/Nico) e voltar ao mapa | Nomes, especialistas, detalhes, indicação de disponibilidade e navegação corretos |
| E2E-07 | Ambientes em evolução e Nico | Abrir as salas planejadas e Cripto & Wallet; verificar handoff externo em aba separada | Não anunciar integrações futuras como ativas; Nico deve exigir login próprio na Nexa Wallet, sem transmitir token, sessão ou dados pessoais do Nex Personal |
| E2E-08 | Mobile/a11y | 390×844, 360×800 e teclado | Sem overflow horizontal crítico; foco visível; botões acionáveis; texto legível |
| E2E-09 | Conta manual | Criar conta fictícia e informar saldo `2.500` | R$ 2.500,00 como dado declarado, jamais saldo bancário confirmado |
| E2E-10 | Transações | Registrar receita/despesa com e sem ajuste explícito do saldo | Sinal correto; saldo só altera quando autorizado |
| E2E-11 | Importação | Prévia CSV/OFX; repetir arquivo e reordenar linhas | Sem novas duplicações do mesmo arquivo; manter compras legítimas idênticas |
| E2E-12 | Sobreposição | Importar arquivos de períodos parcialmente sobrepostos | Aviso de revisão; não apagar lançamentos por igualdade fraca |
| E2E-13 | Planejamento | Criar orçamento, meta e lembrete futuro, passado e para hoje | Totais em centavos precisos; datas por calendário São Paulo; passado é lembrete a conferir, não dívida confirmada |
| E2E-14 | Mila e Maya | Usar movimentações sintéticas recorrentes e não recorrentes | Inferências com ressalvas; sem assinatura, reajuste ou obrigação confirmados |
| E2E-15 | Noah | Digitar duas propostas simuladas | Somente valores inseridos; sem ofertas bancárias inventadas, pré-aprovação ou afirmação de CET |
| E2E-16 | Exportação | Baixar JSON do próprio testador e inspecionar | Apenas campos permitidos, metadados de auditoria; sem sessão, senha, provedor privado ou outro titular |
| E2E-17 | Restrições | Tentar acessar rotas empresariais ou executar Pix/ações financeiras da Wallet no Nex Personal | Rotas e ações indisponíveis no PF; zero movimentação real, sem compartilhar sessão com PJ ou Wallet |
| E2E-18 | Recuperação | Recarregar, alternar abas, entrar/sair e retornar após falha | Sem vazamento de estado de sessão, travamento ou dados de usuário anterior |

## Inventário do escritório, conferido no código da branch (não confundir com teste visual)

**Recursos com experiência disponível na homologação (`ready: true`):**
Meu dinheiro (Nina), Investimentos (Léo), Cripto & Wallet (Nico, apenas acesso externo com login próprio), Compras e crédito (Bia), Documentos (Mel), Oportunidades (Noah), Serviços públicos (Theo), Resolver dívidas (Joca), Entender direitos (Bella).

**Ambientes/jornadas em evolução (`ready: false`):**
Minha saúde (Luna), Educação (Duda), Meu dia (Zoe), Viagens e lazer (Kai), Mobilidade (Max), Casa e família (Luca), Criação e mídia (Gabi).

**Critério obrigatório:** os 16 cartões podem existir sem que todos tenham integração transacional. Mostrar limite funcional honestamente, sem anunciar serviço futuro como ativo.

## Modelo de evidência por execução

- ID do caso:
- Data e horário / navegador / dispositivo / viewport:
- Git HEAD da PR:
- SHA efetivamente publicado no Render:
- Tipo de testador: fictício autorizado (sem e-mail no registro):
- Resultado: PASS / FAIL / BLOCKED / NÃO EXECUTADO
- Screenshot/registro sanitizado:
- Erro reprodutível e passos mínimos:
- Issue/commit corretivo:
- Reteste no mesmo SHA: 

## Portão para convidar mais testadores

Todos os casos críticos E2E-01 a 05, 09 a 11, 13, 16 a 18 precisam de evidência PASS, sem bugs severos de navegação ou privacidade; a experiência 2D (E2E-06 a 08) deve ser utilizável em desktop e mobile. Revisar CI e Render no mesmo SHA, manter consentimentos e impedir qualquer ação financeira externa. Só ampliar o grupo de homologação após documentar essa evidência.

**Não alterar dados ou integrações de produção. Não fazer merge por causa desta matriz.**
