# Espaço Lounge — ERP (Angular + Google Sheets)

## Contexto

**Espaço Lounge** é um ERP leve para salão de beleza: **recepção** (agenda, clientes, serviços) e dados operacionais gravados numa **planilha Google** que funciona como base de dados. Não há servidor próprio no MVP: o **Google Apps Script** expõe um **Web App** (`doGet` / `doPost`) que lê e escreve nas abas (**Clientes**, **Serviços**, **Atendimentos**, etc.), alinhadas ao ficheiro de referência **`ERP Espaço Lounge.xlsx`** na raiz do repositório.

- **Front-end:** Angular 19 (standalone), interface em **português (pt-BR)**, `HttpClient` para o endpoint do script (ver `src/app/core/services/sheets-api.service.ts`).
- **Desenvolvimento:** `ng serve` com **proxy** (`proxy.conf.json`) para `/gas` → URL do deploy `/exec`, evitando CORS e tratando redirects de login (secção abaixo).
- **Produção:** URL do Web App configurada em `environment.production.ts`; CORS pode exigir proxy no mesmo domínio ou deploy com acesso público adequado.

Documentação complementar:

| Documento | Conteúdo |
|-----------|----------|
| [docs/FLUXOS_E_TELAS.md](docs/FLUXOS_E_TELAS.md) | Personas (recepção, técnico, dono), telas e fluxos mínimos |
| [docs/CONTRATO_PLANILHA.md](docs/CONTRATO_PLANILHA.md) | Abas, colunas, ações da API (`listClientes`, `getCliente`, `updateCliente`, …) |
| [docs/CRITERIOS_SQL.md](docs/CRITERIOS_SQL.md) | Critérios para eventual migração para SQL |
| [apps-script/README.md](apps-script/README.md) | Colar `Code.gs`, implantar Web App, testar `health` |

Sempre que alterar `apps-script/Code.gs`, **publique uma nova versão** da implantação na planilha; o Angular só reflete mudanças de API após isso.

## Pré-requisitos

- Node.js 20+ e npm
- Conta Google e planilha com as abas descritas em [docs/CONTRATO_PLANILHA.md](docs/CONTRATO_PLANILHA.md)
- Apps Script publicado (veja [apps-script/README.md](apps-script/README.md))

## Configuração

1. **Planilha:** use o modelo **ERP Espaço Lounge** (abas **Clientes**, **Serviços**, **Atendimentos**, etc.). O contrato reflete o export `ERP Espaço Lounge.xlsx` na raiz do repositório — veja [docs/CONTRATO_PLANILHA.md](docs/CONTRATO_PLANILHA.md). O nome da aba de catálogo tem acento: **Serviços**.
2. **Apps Script:** copie `apps-script/Code.gs` para o editor da planilha, implante como aplicativo da web e copie a URL `/exec`.
3. **Proxy (desenvolvimento):** edite [proxy.conf.json](proxy.conf.json) e substitua `COLE_SEU_DEPLOYMENT_ID` pelo ID da URL (trecho entre `/macros/s/` e `/exec`).
4. **Instalação e servidor local:**

```bash
npm install
npm start
```

Abra `http://localhost:4200`. As chamadas vão para `/gas`, que o proxy encaminha ao Apps Script.

### 302 / CORS com `accounts.google.com`

O Web App estava pedindo **login Google** (deploy sem “qualquer pessoa”). O navegador seguia o **302** até `accounts.google.com` e o **XHR falhava em CORS**.

Neste projeto o [proxy.conf.json](proxy.conf.json) usa **`followRedirects: true`**: o **Node** segue o redirect; o Angular fala só com `localhost`, sem CORS no domínio do Google. A resposta ainda pode ser **HTML de login** — aí o app mostra mensagem orientando o deploy.

**Correção definitiva:** no Apps Script, **Implantar → Gerenciar implantações → Editar** → **Quem tem acesso:** **Qualquer pessoa** ou **Qualquer pessoa, mesmo anônima** → **Nova versão** → **Implantar**. Teste `.../exec?action=health` em **aba anônima** (tem que vir JSON). Veja [apps-script/README.md](apps-script/README.md).

Depois de alterar `proxy.conf.json`, reinicie o `ng serve`.

## Testes unitários (Karma, padrão Angular CLI)

```bash
npm test
```

## Produção

```bash
npm run build
```

Ajuste [src/environments/environment.production.ts](src/environments/environment.production.ts) com a URL completa do `/exec`. Se o navegador bloquear por CORS, coloque o front atrás de um proxy no mesmo domínio ou use outra estratégia de hospedagem documentada no plano do projeto.

## Estrutura

| Pasta / arquivo | Conteúdo |
|-----------------|----------|
| `src/app/pages/*` | Telas: início, agenda (lista + **novo atendimento** por tipo: Serviço, Mega, Pacote, Cabelo, Produto), **clientes** (lista, novo, editar), serviços |
| `src/app/core/services/sheets-api.service.ts` | `HttpClient` → Web App (POST com `text/plain` + JSON) |
| `src/environments/` | `environment.ts` (dev) e `environment.production.ts` (URL do `/exec`) |
| `apps-script/Code.gs` | `doGet` / `doPost` e acesso à planilha |
| `scripts/dump_xlsx.py` | Utilitário opcional para inspecionar o XLSX de referência |
| `docs/` | Fluxos, contrato da planilha, critérios SQL |
| `src/app/app.component.*` | Shell da aplicação (navegação principal) |
| `.editorconfig`, `.vscode/`, `tsconfig*.json` | Alinhados ao projeto gerado pelo Angular CLI 19 |
