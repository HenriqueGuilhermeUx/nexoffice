# Nexa PJ — checklist de aceite do primeiro cliente (ERP-only)

Data: 2026-10-28. Responsável: operador autorizado. Registre apenas resultado, horário e referência de incidente — **nunca senha, token, documentos pessoais ou dados bancários**.

## Jornada do primeiro cliente

- [ ] Abrir `https://trynexa.com.br/pj`; clicar em **Criar empresa no ERP**.
- [ ] Criar cadastro com dados próprios e consentimento; confirmar criação do workspace empresarial.
- [ ] Conferir abertura na **Central de Comando** (não na área bancária).
- [ ] Criar um contato fictício explicitamente identificado como teste dentro do CRM do próprio workspace; confirmar listagem; excluir o contato de teste.
- [ ] Criar uma tarefa de teste na agenda; confirmar persistência após atualizar a tela; excluir a tarefa.
- [ ] Abrir Financeiro/ERP e confirmar que contas e registros administrativos são internos ao workspace; não realizar pagamento ou movimentação bancária.
- [ ] Conferir visualização da **Conta Nexa** com recursos financeiros indisponíveis e sem saldos fictícios apresentados como reais.
- [ ] Sair da sessão, fechar a aba, acessar `https://nexa-pj-erp-only.onrender.com/`, entrar novamente e confirmar que a empresa, contato e tarefa removidos não reapareceram.
- [ ] Testar acesso sem sessão: dados privados não devem aparecer. Não usar credenciais de outra empresa sem autorização.
- [ ] Registrar bugs de interface e performance com prints **sem informações sensíveis**.

## Resultado do piloto

| Controle | Resultado | Observação sem dados pessoais |
| --- | --- | --- |
| Abertura inicial | Confirmada pelo proprietário em 2026-10-28 | "testado, abriu ok" |
| Cadastro real | Pendente | |
| Login repetido | Pendente | |
| CRM e tarefas | Pendente | |
| Dados por empresa | CI aprovado; produção pendente | |
| Conta financeira bloqueada | CI aprovado; revisar visualmente | |

## Critério de divulgação
Liberar aquisição controlada do **ERP-only** após conclusão de cadastro, segundo login e um fluxo CRUD sem perda de dados. Bloquear comunicação de Pix, cripto, conta bancária integrada, rendimento ou serviços regulados como disponíveis até integração KYB/SSO e homologações comerciais/jurídicas. Não executar automações de produção com cadastros sintéticos nem apagar dados para limpar testes sem processo documentado.
