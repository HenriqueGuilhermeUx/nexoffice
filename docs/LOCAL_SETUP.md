# Rodando NexOffice localmente

## Requisitos

- Node.js 20+
- npm 10+
- Docker (opcional, recomendado para Postgres)
- `psql` para aplicar o schema manualmente

## 1. Dependências

```bash
npm install
```

## 2. Banco local

```bash
docker compose up -d postgres
psql postgresql://nexoffice:nexoffice@localhost:5432/nexoffice -f infra/postgres/schema.sql
psql postgresql://nexoffice:nexoffice@localhost:5432/nexoffice -f infra/postgres/seed-demo.sql
```

## 3. Variáveis

```bash
cp .env.example .env
```

Para o ambiente local:

```env
DATABASE_URL=postgresql://nexoffice:nexoffice@localhost:5432/nexoffice
DATABASE_SSL=false
PORT=4000
```

O `seed-demo.sql` cria o workspace `nexoffice-demo`. Consulte o ID:

```sql
select id,name,slug from workspaces;
```

Depois configure no web:

```env
VITE_API_URL=http://localhost:4000
VITE_WORKSPACE_ID=<uuid-do-workspace>
```

## 4. API

```bash
npm run dev:api
```

Health:

```bash
curl http://localhost:4000/health
```

## 5. Web

```bash
npm run dev:web
```

Sem `VITE_API_URL`/workspace, a Central de Comando abre em modo demonstração. Com as variáveis configuradas, passa a consumir a API real.

## Exemplos

Criar contato:

```bash
curl -X POST http://localhost:4000/v1/crm/contacts \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: WORKSPACE_UUID' \
  -d '{"name":"Empresa Exemplo","kind":"company","email":"contato@exemplo.com","source":"indicação"}'
```

Registrar recebível vencido:

```bash
curl -X POST http://localhost:4000/v1/ledger \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: WORKSPACE_UUID' \
  -d '{"direction":"income","category":"serviços","description":"Mensalidade","amountMinor":90000,"status":"overdue"}'
```

Esse lançamento também produz `payment.overdue`, que cria uma ação para o agente de Cobrança no Command Center.
