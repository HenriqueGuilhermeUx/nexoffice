# NexOffice Mobile

Aplicativo nativo do NexOffice para iOS e Android.

## Princípio do produto

O app não é um ERP de desktop espremido no celular. Ele é o **controle remoto da empresa**: informação, decisão e ação em poucos segundos.

A navegação inicial é deliberadamente pequena:

- **Hoje** — pulso do negócio, agenda, tarefas e decisões prioritárias;
- **Clientes** — base de contatos e visão comercial rápida;
- **Dinheiro** — saldo realizado, recebíveis, pagamentos e lançamentos;
- **Equipe** — conversa real com a Equipe Digital pelo mesmo backend do NexOffice;
- **Mais** — workspaces, conta e segurança;
- botão **+** — registro rápido de contato, oportunidade, tarefa, receita ou despesa.

## Segurança

- token de sessão armazenado com `expo-secure-store`;
- contexto isolado por `x-workspace-id`;
- nenhuma chave de provider é armazenada no app;
- ações sensíveis continuam passando pelas políticas e gates do backend;
- o app não altera `NEXOFFICE_EXTERNAL_ACTIONS`.

## API

Por padrão o app aponta para:

```text
https://api.nexoffices.com.br
```

Para desenvolvimento local:

```bash
EXPO_PUBLIC_API_URL=http://SEU_IP:4000 npm start -w @nexoffice/mobile
```

## Requisitos

- Node.js 22.13+
- Expo SDK 57

## Rodar

Na raiz do monorepo:

```bash
npm install
npm start -w @nexoffice/mobile
```

Depois abra pelo Expo Go ou um development build. Para Android/iOS:

```bash
npm run android -w @nexoffice/mobile
npm run ios -w @nexoffice/mobile
```

## Escopo do MVP 0.1

Esta branch é propositalmente isolada do lançamento web atual. Antes de merge em `main`, validar em aparelho real:

1. login e persistência de sessão;
2. troca de workspace;
3. Central Hoje;
4. contatos e busca;
5. financeiro e marcar como pago;
6. ações rápidas;
7. conversa com Equipe Digital;
8. aprovar/recusar ações;
9. logout e reentrada;
10. comportamento sem conexão e respostas 401.

Scanner, voz, push notifications e widgets ficam para etapas posteriores, depois de validar o hábito mobile básico.
