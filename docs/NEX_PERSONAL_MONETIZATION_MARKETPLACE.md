# Nex Personal — Monetização responsável sem custódia (23/10/2026)

## Tese
Oferecer inteligência pessoal sem tarifa de conta e monetizar **serviços opcionais**: distribuição por instituições/parceiros habilitados, marketplace com comissões e publicidade claramente identificada, somente após validação regulatória e tratamento adequado de dados. Ser non-custodial não dispensa regras de correspondente, investimentos, seguros ou ITP.

## Quatro camadas
1. **Valor ao cliente:** Maya e agentes organizam, comparam e orientam sem vender prioridade de recomendação. Consolidar bancos ou wallets apenas após permissão explícita. É a camada que cria confiança e uso recorrente.
2. **Marketplace e originação:** oportunidades com múltiplos fornecedores e preços comparáveis. Crédito/financiamento via correspondente ou outra estrutura contratual validada; investimentos via distribuidor/intermediário habilitado; seguros via corretora habilitada; viagens/compras via parceiros. Comissões e benefícios devem ser transparentes.
3. **Mídia contextual opt-in:** anúncios identificados e isolados do ranking neutro. Preferir contexto que o cliente fornece naquela sessão (por exemplo, pesquisar hotel) em vez de varredura permanente de transações; nenhuma publicidade com dados de saúde, menores ou vulnerabilidade financeira. Não usar saldos/dívidas/seguro/cripto para segmentação automaticamente.
4. **Agentics:** depois do aceite e permissão por tarefa, preparar documentação, comparar propostas, verificar elegibilidade e facilitar contratação ou ITP por entidade autorizada. Regras de consentimento, limite, expiração, step-up e reconciliação.

## Modalidades comerciais a verificar
| Frente | Receita hipotética | Porta de entrada | Condição |
| --- | --- | --- | --- |
| Crédito pessoal/consignado/veículos | Comissão de originação por contrato; exemplo de planejamento 1–5% **não validado** | Simular custos reais e comparar CET por mesmo valor/prazo | Correspondente contratado sob Res. CMN 4.935/2021 e requisitos de qualificação, ou parceiro com regime jurídico compatível |
| Investimentos | Remuneração/rebate de distribuição contratual | Organizar alocação e comparar produtos elegíveis, taxas e risco | Intermediário habilitado; disclosure Res. CVM 179; consultoria individualizada requer enquadramento próprio e evita rebates conflitantes |
| Seguro e consórcio | Comissão contratual do parceiro | Comparação a pedido com preço, franquia, carência e condições | Intermediação por corretor/empresa regular na SUSEP conforme produto/regime |
| Compras, hotel, carro | CPA/take-rate por transação concretizada | Comparar preço total, datas, termos, política de cancelamento | Contratos comerciais, estoque/condições verificados e cancelamento claro |
| Cashback e mídia | CPA/CPC ou patrocínio claramente identificado | Benefícios opcionais e campanhas contextuais | Base legal/finalidade específica, disclosure publicitário, opt-in claro e revogação; nada de usar o consentimento Open Finance como publicidade automática |

## Regras de imparcialidade (anti pay-to-play)
- Ranking básico compara produtos por métricas adequadas ao domínio, como custo total e CET para financiamento em condições comparáveis; não ordena por comissão, CPL ou patrocinador.
- Mesmo provedor sem comissões pode ser recomendado se representar melhor opção. Se não houver dados ou ofertas suficientes, indicar resultados incompletos.
- Blocos patrocinados aparecem identificados e separados, jamais como recomendação imparcial de Maya/Léo/Bia.
- Expor instituição emissora, contrato, validade da oferta, remuneração recebida, riscos, cláusulas e conteúdo patrocinado **antes** de pedir ação.
- Não prometer aprovação de crédito, rentabilidade, limite de cartão, cashback creditado ou desconto sem confirmação do parceiro.
- Zero ofertas reais e zero pagamentos reais nesta homologação.

## Dados e publicidade: firewall de consentimentos
1. Open Finance: recebimento para organização financeira de acordo com escopo e finalidade consentida. Esse consentimento **não é** permissão para perfilamento publicitário ou remessa a parceiros.
2. Ao escolher comparar crédito, o cliente pode fornecer parâmetros manualmente; somente em integração futura haverá solicitação granular para compartilhar o subconjunto necessário com parceiro determinado.
3. Consentimento publicitário separado, livre, específico, informado e revogável, sem padrões escuros e sem vincular funcionamento básico ao aceite. Mesmo com consentimento, vedar uso de dados sensíveis (saúde e menores), inferências sobre vulnerabilidade ou publicidade discriminatória.
4. Marketing opt-out/default off. Jamais fornecer extratos integrais, endereços cripto ligados à identidade, lista de farmácias ou dívidas a anunciantes.
5. Métricas de campanhas agregadas com limites de privacidade; atribuição individual requer fundamento, prazo e medidas adicionais. Não treinar modelos publicitários com extratos pessoais por padrão.

## Fluxos pretendidos
**Crédito**: usuário pede comparação → Maya confirma objetivo e prazo → parceiro fornece propostas válidas e CET → Bia/Nina compara preço total, CET, seguros e riscos → mostra opções neutras e patrocínios separados → usuário decide → consentimento por parceiro/finalidade → redirecionamento ou execução regulada → reconciliação e registro de comissão.
**Carro**: Max pesquisa preços, Noah compara financiamento e seguro, Mel organiza documentos e Gabi prepara anúncio do antigo; nenhuma capacidade entre apps recebe acesso automático ao banco/identidade.
**Investimentos**: Léo identifica custos elevados ou concentração somente de posições autorizadas → explica alternativas comparáveis e restrições → oferece carta de esclarecimento/renegociação; para recomendação personalizada, parceria consultiva/habilitação CVM apropriada.
**Pix**: na fase futura, uma ITP habilitada ou outra estrutura autorizada inicia pagamento autorizado, com confirmação do usuário. Dados e tokens de pagamento não passam ao módulo de anúncios.

## Cenário de unit economics: hipótese, não resultado
Receita comercial bruta = (contratações confirmadas × comissão contratada) + (ações comerciais elegíveis × CPA) + (cliques válidos e consentidos × CPC) + serviços premium realmente contratados. Descontar CAC, pagamentos/cancelamentos, chargeback, custos do parceiro, compliance, infraestrutura e suporte. Nunca modelar 1%–5% como tarifa adquirida antes de contrato.
KPIs de sucesso para cliente: economia líquida demonstrada, tempo poupado, retenção voluntária, taxa de correção de recomendações, reclamações, revogação de consentimento e precisão do comparador. Receita é consequência do valor.

## O que entrou agora na branch draft #86
- Noah ganhou comparador manual de duas propostas por entrada + parcelas + custos extras informados, **somente no navegador**.
- Quando prazos ou preços-base são diferentes, não apresenta vencedor. O valor calculado é nominal e **NÃO é CET**, aprovação ou oferta.
- Não há API de parceiros, dados vendidos, envio de leads, cashback real, anúncios direcionados ou agregação bancária habilitada.
- Os seis módulos comerciais exibem estado real: nenhum parceiro conectado; publicidade desligada.
- Scripts de CI verificam matemática, ausência de tracking, ausência de ofertas falsas e independência das comissões.

## Gates antes de receita real
- Assinar e validar contratos de correspondência/parceria, avaliar CVM/SUSEP e ITP apropriados.
- Publicar termos e tabela de transparência de conflitos/comissões, ranqueamento auditável e canal de reclamações.
- Implementar gateway de parceira com autenticação, escopo de dados, consentimento granular/retirada, idempotência, provas de aceite, antifraude e auditoria sem payload sensível.
- Testar CET, tributação, cancelamentos, reclamações, rate limits e recomendações enviesadas; DPIA/LGPD/segregação de saúde e educação.
- Publicar apenas após validação em homologação e revisão de segurança; não fazer merge na produção NexOffices.

## Fontes de verificação
- CMN 4.935 (correspondente): https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=4935&tipo=RESOLU%C3%87%C3%83O+CMN
- CVM consultor de valores mobiliários: https://www.gov.br/investidor/pt-br/investir/como-investir/profissionais-do-mercado/consultor-de-valores-mobiliarios
- CVM 179: https://conteudo.cvm.gov.br/legislacao/resolucoes/resol179.html
- SUSEP registro de corretores: https://www.gov.br/pt-br/servicos/cadastrar-corretores-de-seguros
- Open Finance BC: https://www.bcb.gov.br/meubc/faqs/s/open-finance
- ITP BC: https://www.bcb.gov.br/estabilidadefinanceira/participantespix
- ANPD legítimo interesse e salvaguardas: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse