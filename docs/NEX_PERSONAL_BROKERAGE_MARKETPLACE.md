# Nex Personal + F-Insight — vitrine futura de corretoras
**24/10/2026 · PR #86 · estado: arquitetura de distribuição preparada, comercialização BLOQUEADA.**

## Objetivo e proposta de produto
Na mesma seção Investimentos & Mercados — F-Insight, o usuário poderá:
1. Entender categorias de ativos e critérios de seleção com o Léo, sem aconselhamento automatizado.
2. Fazer pesquisa de mercado com fonte e data identificadas, quando o conector privado estiver homologado.
3. Comparar **duas propostas que ele já recebeu** de corretoras, com conteúdo digitado somente no navegador, sem salvar ou transmitir.
4. **No futuro**, explorar ofertas reais de instituições parceiras, com custódia, suitability e contratação na instituição habilitada, após autorização e integração.

Hoje o backend `GET /v1/personal/finsight/brokerage` exige sessão PF e ativação e responde invariavelmente com `status:'preparation'`, `partners:[]`, `products:[]`, `distributionEnabled:false`, `leadSubmissionEnabled:false`, `recommendationEnabled:false`, `suitabilityVerified:false`, `accountOpeningEnabled:false`, `orderExecutionEnabled:false`, `customerDataShared:false`. Não existe POST de lead, cadastro, conta ou ordem. Nenhum dataset sintético pode ser promovido como oferta comercial. Nenhuma mudança em F-Insight original, NexOffice PJ ou Nexa.

## Comparador de propostas manual, já no frontend isolado
`apps/web/src/PersonalBrokerage.tsx` oferece categorias educativas (renda fixa, títulos públicos, fundos, ETFs, ações, previdência) e 2 propostas para preenchimento. O usuário compara instituição, produto, categoria, aplicação mínima, taxas, liquidez, riscos. Sem pontuação automática, recomendação, projeções de rentabilidade ou identificação de vencedor.

Dados de propostas ficam apenas em estado React, sem persistência no Neon, localStorage, envio ao F-Insight ou parceiros. A tela é remontada na troca de token do usuário. Isso NÃO atesta informação inserida por ele como verdadeira.

## Produto comercial futuro — contrato de catálogo (proposta, NÃO implementado)
Somente cadastrar um parceiro que tenha concluído verificação jurídica e operacional. Campos obrigatórios por oferta real:
- `partnerId`, CNPJ e nome da corretora/distribuidora, status de autorização e origem;
- `productId`, categoria, emissor, administrador/gestor quando aplicável, denominação;
- identificadores regulatórios e links para documentos oficiais, termos, política de riscos;
- taxas *efetivas* e custos com unidade/base temporal, valor mínimo, vencimento, liquidez/carência, indexador e condições; nenhuma taxa estimada sem rótulo;
- identificação de garantias somente mediante documentação, sem alegar FGC genericamente;
- `sourceUrl`, `sourceAsOf`, `retrievedAt`, `expiresAt`; conteúdo vencido deve ficar indisponível;
- `commissionModel`, `commercialRelationship`, `sponsored`, conflitos e aviso de remuneração sempre visíveis;
- critérios de elegibilidade e suitability sob responsabilidade de intermediário autorizado e revisão legal da jornada;
- deep link permitido com domínio verificado; sem colocar dados PF, tokens, CPF ou saldos em URL.

O ranking comercial e a seleção por APR/rentabilidade presumida ficam proibidos até definição contratual/regulatória e políticas de exibição justas. Distinção clara entre `Conteúdo informativo`, `Patrocinado`, `Oferta da corretora`.

## Controles para ativar parceiros reais
1. **Legal/compliance:** classificar exatamente publicidade informativa, indicação comercial, captação/prospecção, assessoria ou atividade de distribuição. Não presumir que um contrato de afiliado elimina exigências de autorização. Revisar Resoluções CVM 30 (suitability), 178 (assessor), 179 (transparência de remuneração/intermediários) e, se pertinente, 160 (ofertas públicas). Legislação aplicável depende da classe de produto e fluxo contratado.
2. **Parceiros:** contrato assinado, termos autorizando exibição de cotação e material promocional, identificação de ofertas ativas, monitoramento de atualização, SLA, cancelamento e conformidade LGPD.
3. **Consentimento:** compartilhamento de dados pessoais **desligado por padrão**. Apenas com finalidade específica, confirmação afirmativa, retenção delimitada e política de cancelamento; guardar prova de aceite e versão do consentimento. Nunca encaminhar posição financeira completa por padrão.
4. **Suitability:** se a jornada gerar recomendação ou solicitação/execução de aplicação, avaliar e aplicar controles do distribuidor autorizado antes da etapa correspondente. Não permitir recomendar ativo específico por agente Léo/Maya sem governança e autorização necessárias.
5. **Monetização:** publicidade identificada, remuneração por encaminhamento ou comissão apenas onde o enquadramento legal e contrato permitirem; divulgar relação comercial e conflito de interesses com destaque adequado. Zero promessa de retorno.
6. **Segurança:** endpoint do catálogo somente leitura e com auth PF, guardião de fonte, parceiros em allowlist e assinatura/verificação do feed, normalização estrita dos campos, URL HTTPS com host validado, kill switch, trilha auditável, testes de expiração, sem fallback de demonstração.
7. **Controle operacional:** fases de habilitação separadas: `educational_catalog`, `partner_catalog`, `user_opt_in_lead`, `regulated_handoff`; todas além da primeira exigem aprovação explícita de governança antes do código que as efetive.
8. **Arquitetura:** F-Insight continua motor de research; Nex Personal é identidade/UX PF; a corretora retém conta, custódia, liquidação e suitability conforme seu papel. NexOffice PJ permanece em arquitetura/credenciais próprias.

## Homologação mínima antes de publicar novos commits
- CI da PR #86 no SHA exato deve passar (build + smoke novo `scripts/smoke-nex-personal-brokerage.mjs` + integração do preview).
- E2E em navegador: seção Investimentos acessível a partir do escritório 2D; vitrine em preparação; lista educativa; comparação de duas propostas não transferida ou persistida; após logout/login, campos limpos; sem links de contratação; sem vazamento de credenciais; modo mobile.
- API anônima 401; sessão PF válida recebe `products:[]` e `partners:[]`; POST bloqueado 404; backend F-Insight original não tocado; nenhuma rede externa chamada pelo catálogo.
- Não modificar Render PF Preview enquanto o GitHub Actions falhar; PR DRAFT, sem merge.

## Fontes regulatórias oficiais para avaliação jurídica
- CVM Res. 30: https://conteudo.cvm.gov.br/legislacao/resolucoes/resol030.html
- CVM Res. 178: https://conteudo.cvm.gov.br/legislacao/resolucoes/resol178.html
- CVM Res. 160: https://conteudo.cvm.gov.br/legislacao/resolucoes/resol160.html
- CVM (transparência, Res. 179): https://www.gov.br/cvm/pt-br/assuntos/noticias/2023/cvm-edita-marco-regulatorio-para-atividade-de-assessor-de-investimento

Isto é um plano técnico/comercial condicionado, não um parecer jurídico nem autorização para distribuir produtos.
