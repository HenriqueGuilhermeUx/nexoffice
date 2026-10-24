# Nex Personal — Motor de ETL financeiro e on-chain (23/10/2026)

## Objetivo
Transformar movimentações CSV/OFX, futuras contas Open Finance consentidas e futuros extratos EVM opt-in em classificações confiáveis para Maya, Nina, Mila e Léo, **sem assumir custódia, capacidade bancária ou execução de transações**.

## Entregue na branch isolada
- Motor determinístico reutilizável no pacote de integrações: limpeza de descrições, categoria, confiança, motivo, tratamento de fluxo, referência estável, origem e unidades exatas.
- Categorias sugeridas automaticamente no importador atual de transações manuais e CSV/OFX.
- API autenticada de **prévia em memória** (máximo 40 eventos): POST /v1/personal/transactions/enrichment/preview. Não consulta banco, carteira, Belvo nem Alchemy, não armazena os eventos e não altera saldos.
- Quatro tratamentos: expense, income, excluded_internal, review. Pix, créditos de origem ambígua, transferências e investimentos não entram automaticamente no total de despesas/receitas.
- Colunas aditivas no PostgreSQL pessoal: analysis_role, analysis_confidence, category_origin, analysis_rule (migração 049). Linhas antigas permanecem intactas.
- Botão de confirmação de transações ambíguas, com comprovação expressa de titularidade para tratamento excluded_internal; histórico registra decisão do usuário.
- Testes unitários e integração verificando classificação, transferências próprias, deduplicação forte/fraca, fonte on-chain, proprietário e ausência de pagamentos.

## Etapas do pipeline
Capturar → validar → normalizar → mascarar identificadores para exibição → enriquecer categoria/comerciante → atribuir confiança → detectar duplicidade com referência confiável → diferenciar despesa/receita/transferência/revisão → permitir correção pelo usuário → apresentar análises e proveniência.

## Open Finance — não conectado
Solicitar consentimento específico e revogável por instituição e finalidade antes de usar dados; somente então adaptar IDs de transação, datas, valores, comerciantes e categorias opcionais da Belvo. A categorização e merchant enrichment da Belvo podem depender de habilitação comercial adicional. Nenhum acesso a conta bancária do cliente foi ativado.
Fontes: https://developers.belvo.com/pt-br/apis/belvoopenapispec/transactions/listtransactions e https://www.bcb.gov.br/meubc/faqs/s/open-finance

## On-chain — prévia sem coleta automática
Usar somente carteira/chain autorizadas pelo usuário; preservar chainId, tx hash, log index, token/contrato, quantidade atômica e decimais (sem float). Entradas de USDC não são automaticamente renda e swaps/bridges não são despesas ordinárias duplicadas. Tokens falsificados podem imitar tickers: verificar contrato, chain e decimais antes de aceitar token como verdadeiro. Movimento pendente/revertido não é liquidado. Nenhum valor cripto é convertido para BRL sem cotação, horário e fonte verificáveis. Gas em ativo nativo e lucros tributáveis exigem motores próprios.
API futura de referência: https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers

## Mila — detecção de possíveis despesas recorrentes (somente leitura)

- Endpoint autenticado `GET /v1/personal/transactions/recurring-patterns`, filtrado por `owner_user_id` e limitado a 1.800 despesas classificadas do próprio usuário, dentro de até 14 meses.
- Analisa no máximo 2.000 linhas **sem armazenar novos perfis**, sem conectar Open Finance ou blockchain e sem enviar transações a parceiros, publicidade ou modelo externo.
- Só propõe um padrão quando identifica pelo menos 3 meses consecutivos, no máximo uma cobrança por mês para o mesmo comerciante, datas com diferença de até 8 dias e variação de valor até 20%.
- Procura um possível aumento nominal de pelo menos R$ 5 e 10% entre a primeira e a última observação analisada; isso **não confirma** reajuste contratual, cobrança indevida ou economia.
- Ignora transferências, Pix, aplicações, cripto, itens com classificação pendente e categorias de saúde/educação, além de narrativas com indícios sensíveis.
- Disponível na área Gastos, com linguagem de incerteza, último valor informado e data da última movimentação, sem emitir alertas fora do aplicativo.
- Testes unitários e de isolamento por usuário: `scripts/smoke-nex-personal-recurring.mjs` e `scripts/smoke-nex-personal-studio.mjs`. Sem notificações automáticas ou cancelamento.

## Correção, precisão e segurança
- Não misturar dados de outros produtos do conglomerado; carteiras Nexa/Privy só vinculadas voluntariamente com prova de controle e permissão de leitura.
- Sem referência bancária forte, o importador preserva duas compras idênticas no mesmo arquivo. Um hash do **multiconjunto de linhas** torna a reimportação do mesmo arquivo idempotente mesmo após reordenação; a posição relativa entre cobranças idênticas é mantida por contador de ocorrências. A estratégia anterior (batch-v2) continua reconhecida na reimportação exata, preservando compatibilidade.
- **Limitação residual:** arquivos diferentes mas parcialmente sobrepostos ainda podem duplicar movimentações sem referência. Arquivos antigos batch-v2 reordenados não podem ser reconhecidos retroativamente sem informações adicionais. Expor a revisão ao usuário antes de assumir identidade bancária; não comparar apenas data/valor/descrição para descartar um lançamento.
- Nenhuma informação privada de gastos é compartilhada com marketing, agentes externos ou outros usuários.
- Correções pessoais prevalecem sobre regras automáticas, com auditoria e proveniência; nenhuma IA deve inventar classificação bancária verificada.
- Gates para feeds reais: consentimentos, webhooks idempotentes, confirmação de endereço, antifraude, row-level security, revogação, políticas de retenção, reconciliação, FX, taxas e backups.

**Status:** branch feature/nex-personal-foundation-20261022, PR draft #86, CI e homologação isolada; sem merge, sem operação financeira externa.