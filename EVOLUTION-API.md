# Evolution API (Docker) — EspacoLounge

Stack **desacoplado** do ERP. Não altera `api/docker-compose.yml` nem a base Postgres do sistema.

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Docker Engine + Compose v2)
- Portas livres no host: **8080**, **8081**, **5434**, **6380**

## 1. Configurar variáveis

Na **raiz do repositório**:

```powershell
copy .env.evolution.example .env.evolution
```

Edite `.env.evolution` e defina pelo menos:

| Variável | Uso |
|----------|-----|
| `AUTHENTICATION_API_KEY` | Chave da API (header `apikey`) — mesma do ERP |
| `EVOLUTION_PUBLIC_URL` | URL que o ERP usa (ex.: `http://localhost:8080`) |
| `EVOLUTION_INSTANCE_NAME` | Nome da instância WhatsApp (ex.: `espaco-lounge`) |
| `POSTGRES_PASSWORD` | Senha do Postgres da Evolution (e na `DATABASE_CONNECTION_URI`) |

Se mudar `POSTGRES_PASSWORD`, atualize também `DATABASE_CONNECTION_URI` com a mesma senha.

## 2. Subir os containers

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution up -d
```

Verificar status:

```powershell
docker compose -f docker-compose.evolution.yml ps
docker compose -f docker-compose.evolution.yml logs -f evolution-api
```

## 3. Parar / remover

Parar (mantém volumes e dados):

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution stop
```

Subir de novo:

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution start
```

Remover containers (volumes **persistem**):

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution down
```

Remover tudo, **incluindo volumes** (apaga sessão WhatsApp e BD da Evolution):

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution down -v
```

## 4. Criar instância WhatsApp

Substitua `SUA_API_KEY` e o nome da instância conforme `.env.evolution`.

### Opção A — Evolution Manager (UI, opcional)

> A imagem `evolution-manager:latest` pode falhar em alguns ambientes (nginx). Se reiniciar em loop, use a **Opção B**.

```powershell
docker compose -f docker-compose.evolution.yml --env-file .env.evolution --profile ui up -d
```

1. Abra [http://localhost:8081](http://localhost:8081)
2. Informe a URL da API: `http://localhost:8080`
3. Informe a API Key (`AUTHENTICATION_API_KEY`)
4. Crie a instância com o nome `espaco-lounge` (ou o valor de `EVOLUTION_INSTANCE_NAME`)
5. Escaneie o QR Code na interface

### Opção B — API (curl / PowerShell)

**Criar instância:**

```powershell
$apiKey = "SUA_API_KEY"
$instance = "espaco-lounge"
$base = "http://localhost:8080"

Invoke-RestMethod -Method Post `
  -Uri "$base/instance/create" `
  -Headers @{ apikey = $apiKey } `
  -ContentType "application/json" `
  -Body (@{
    instanceName = $instance
    integration  = "WHATSAPP-BAILEYS"
    qrcode       = $true
  } | ConvertTo-Json)
```

**Obter QR Code (conectar):**

```powershell
Invoke-RestMethod -Method Get `
  -Uri "$base/instance/connect/$instance" `
  -Headers @{ apikey = $apiKey }
```

A resposta inclui o QR (base64) ou o pairing code. Escaneie no WhatsApp: **Aparelhos conectados → Conectar aparelho**.

**Estado da conexão:**

```powershell
Invoke-RestMethod -Method Get `
  -Uri "$base/instance/connectionState/$instance" `
  -Headers @{ apikey = $apiKey }
```

Estado esperado após parear: `"state": "open"`.

> Use sempre o **nome** da instância na URL, não o UUID interno.

## 5. Testar envio de mensagem

```powershell
$apiKey = "SUA_API_KEY"
$instance = "espaco-lounge"
$base = "http://localhost:8080"
$numero = "5511999999999"   # DDI + DDD + número, só dígitos

Invoke-RestMethod -Method Post `
  -Uri "$base/message/sendText/$instance" `
  -Headers @{ apikey = $apiKey } `
  -ContentType "application/json" `
  -Body (@{
    number = $numero
    text   = "Teste Evolution API — EspacoLounge"
  } | ConvertTo-Json)
```

## 6. Integrar com o ERP

1. Aplique a migration WhatsApp no Postgres do ERP (se ainda não fez):

   ```powershell
   cd api
   npm run db:migrate
   ```

2. Suba API e frontend do ERP normalmente.

3. Acesse **Configurações → WhatsApp** (admin):

   | Campo | Valor |
   |-------|--------|
   | URL da Evolution API | `http://localhost:8080` |
   | API Key | valor de `AUTHENTICATION_API_KEY` |
   | Instância | `espaco-lounge` (nome, não UUID) |
   | Nome da empresa | nome do salão (placeholder `{{empresa}}`) |
   | Integração ativa | ligado |

4. Clique em **Testar conexão** — deve retornar estado `open` se o WhatsApp estiver pareado.

5. Envie uma mensagem manual (cliente, comanda ou agenda) pelo modal **Enviar WhatsApp**.

## Volumes (persistência)

| Volume | Conteúdo |
|--------|----------|
| `evolution_instances` | Sessões / instâncias Baileys |
| `evolution_store` | Armazenamento interno da API |
| `evolution_redis` | Cache Redis (AOF) |
| `evolution_postgres` | Banco Postgres da Evolution |

## Resolução de problemas

| Sintoma | Verificação |
|---------|-------------|
| `404 instance does not exist` no envio | URL deve usar o **nome** da instância, não o UUID |
| Testar conexão falha no ERP | API Evolution a correr? Instância criada e `open`? |
| Porta 8080 em uso | Altere `EVOLUTION_API_PORT` no `.env.evolution` e `EVOLUTION_PUBLIC_URL` / ERP |
| Migration `0045` falhou antes | Veja secção abaixo |

### Migration WhatsApp (`0045`) falhou parcialmente

Se `npm run db:migrate` falhou com FK em `atendimentos`, a migration atual referencia `atendimentos_pedido` (correto). Se restaram tabelas sem FK:

```powershell
cd api
npm run db:migrate
```

Se ainda falhar, no Postgres do ERP (`localhost:5433`) remova objetos parciais e volte a migrar:

```sql
DROP TABLE IF EXISTS whatsapp_logs CASCADE;
DROP TABLE IF EXISTS whatsapp_templates CASCADE;
DROP TABLE IF EXISTS whatsapp_config CASCADE;
DROP TYPE IF EXISTS whatsapp_provider CASCADE;
DROP TYPE IF EXISTS whatsapp_message_tipo CASCADE;
DROP TYPE IF EXISTS whatsapp_log_status CASCADE;
DROP TYPE IF EXISTS whatsapp_connection_status CASCADE;
```

Depois: `npm run db:migrate`.

## Referências

- [Evolution API — Docker](https://doc.evolution-api.com/v2/en/install/docker)
- [Evolution API — Database](https://doc.evolution-api.com/v2/en/requirements/database)
- [Evolution API — Redis](https://doc.evolution-api.com/v2/en/requirements/redis)
