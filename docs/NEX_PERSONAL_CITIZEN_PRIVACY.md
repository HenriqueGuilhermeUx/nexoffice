# Nex Personal — novos especialistas, serviços públicos e privacidade

## Visão para o cliente
Os nomes de marcas internas não aparecem nos ambientes do escritório; cada setor mostra claramente uma função. Maya coordena os especialistas.

### Cida — Serviços públicos
Guia inicial de segunda via do IPTU, emissão/agendamento da CIN, alvará municipal e Detran. O cliente segue o canal oficial do órgão, que varia por município e UF. Nenhum boleto, agendamento, taxa ou documento é gerado pelo Nex Personal nesta fase.

### Recomeço — Dívidas e renegociação
Simulação local no navegador de entrada, parcelas e custo nominal do acordo. Carta ao credor solicitando origem da cobrança, memória de cálculo, juros, CET, condições, quitação e baixa do cadastro. Consulta ao SCR/Registrato ou Serasa não conectada; ofertas nunca são inventadas.

### Lia — Orientação jurídica inicial
Checklists no navegador de contratos, cobranças, questões de condomínio e assuntos trabalhistas. Não determina validade, prescrição, probabilidade de êxito, nem produz representação judicial. Integração futura à plataforma jurídica depende de autorização, qualidade das fontes e revisão por profissional habilitado.

## Banco PostgreSQL: transporte obrigatório com verificação de certificado

- Nex Personal na homologação pública requer modo PostgreSQL sslmode=verify-full, inclusive quando o URL do Neon originalmente contém sslmode=require/prefer/verify-ca/disable.
- O modo escolhido verifica cadeia do certificado e nome do servidor (hostname); não é criptografia ponta a ponta de dados nem eliminação do acesso de operadores autorizados.
- Em produção da homologação, DATABASE_SSL=true não pode resultar em rejectUnauthorized=false. O módulo `apps/api/src/personal-preview-db-config.ts` é aplicado tanto à pool de API quanto ao cliente de migrações.
- Exceção limitada: CI com **CI=true e NEX_PERSONAL_PREVIEW_CI=true** pode conectar a um Postgres de testes sem TLS. O ambiente do Render não ativa essa exceção; conexão local fora desse contexto é recusada.
- A configuração anterior de outros módulos PJ permanece inalterada nesta PR para evitar alterações transversais sem auditoria. Essa proteção não substitui análise de segredos, criptografia em repouso, MFA, retenção e resposta a incidentes.
- Smoke de segurança: `scripts/smoke-nex-personal-db-tls.mjs`, executado em todo CI PR.

## Segurança e confidencialidade
- Cida, Recomeço e Lia não usam chamadas de API nem armazenamento local: cálculos e trechos ficam apenas na memória do navegador até fechar a aba.
- Identidade, contas manuais, movimentações e preferências de outras áreas continuam armazenadas no PostgreSQL pessoal em nuvem. Não declarar criptografia ponta a ponta ou que administradores de infraestrutura jamais poderão acessar. O status é explicado claramente na tela Privacidade.
- API de exportação autenticada e filtrada pelo usuário, sem cache e com auditoria; dados empresariais, credenciais e sessões não fazem parte do arquivo.
- **Projeções de colunas explicitamente autorizadas:** cada categoria tem sua lista fixa de campos. A exportação não usa `SELECT *`, de forma que uma futura coluna de `access_token`, `provider_secret` ou identificador interno não passe automaticamente para o arquivo.
- A cópia inclui movimentações, saldo declarado, orçamento e metas, consentimentos e metadados de ações de auditoria do próprio usuário, mas não devolve referências opacas de conexão, identificadores internos do provedor de transações, hashes de deduplicação, senhas ou sessões.
- Máximo de 5.000 registros por categoria, com indicação de categorias truncadas. Isso não é garantia de portabilidade legal integral nem substitui solicitação formal de acesso/retificação/exclusão.
- Testes em banco descartável criam uma coluna de segredo simulada e um segundo titular: a exportação do primeiro não pode conter nenhum dos dois, nem utilizar a lista de colunas futura de forma implícita.
- Na homologação, política CSP restritiva, execução de agentes financeiros reais desativada, separação de contextos de saúde e menores, e compartilhamento com empresas do grupo desligado.
- Antes de liberar clientes reais: revisão de RLS, backups, MFA, criptografia de campos sensíveis, retenção, exclusão/portabilidade integral, logs, LGPD/DPIA, controle de acessos técnicos e auditoria independente.

## Fontes governamentais e de consumo verificadas
- CIN: https://www.gov.br/governodigital/pt-br/identidade/cin/duvidas-frequentes-sobre-a-cin-campanha
- Registrato: https://www.bcb.gov.br/cidadaniafinanceira/registrato
- SCR: https://www.bcb.gov.br/meubc/relatorioemprestimofinanciamento
- Serasa Limpa Nome: https://www.serasa.com.br/limpa-nome-online
- ANPD e direitos do titular: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados

## Etapas futuras condicionadas a autorização
1. Catálogo oficial e verificado por município/UF, sem inferir links.
2. Integração comercial e legalmente habilitada com Serasa e sistemas públicos quando disponível e aplicável, com consentimento granular e sem coleta de credencial gov.br.
3. Ferramentas jurídicas avançadas com acompanhamento profissional e isolamento; não importar dados da NexJud automaticamente.
4. Alertas de dívidas acionáveis e agendamentos somente com fonte confiável, autenticação e consentimento; pagamentos sempre sujeitos a autorização explícita.

## Estado
Branch draft PR #86, homologação no Render isolada, sem merge/deploy de produção PJ. Compilação Render verificada; testes completos GitHub e fluxo visual ainda sujeitos à validação.