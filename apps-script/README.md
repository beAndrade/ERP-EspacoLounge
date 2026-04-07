# Google Apps Script (Web App)

1. Use a planilha **ERP Espaço Lounge** com as abas reais (**Clientes**, **Serviços**, **Atendimentos**, …). O contrato e o `Code.gs` seguem [docs/CONTRATO_PLANILHA.md](../docs/CONTRATO_PLANILHA.md) (export `ERP Espaço Lounge.xlsx`).
2. **Extensões → Apps Script** e cole o conteúdo de `Code.gs` (substitua o `Código.gs` padrão). Opcional: em **Projeto** → **Configurações do projeto**, alinhe fuso a `America/Sao_Paulo`.
3. Salve. **Implantar → Novo implantação** → tipo **Aplicativo da web**:
   - **Executar como:** eu (a conta dona da planilha).
   - **Quem tem acesso:** para o Angular (localhost ou produção) chamar a API **sem** abrir tela de login do Google, use **Qualquer pessoa** ou **Qualquer pessoa, mesmo anônima** (em inglês: *Anyone* / *Anyone, even anonymous*).
4. Depois de mudar permissões, use **Gerenciar implantações** → **Editar** (ícone de lápis) → **Versão: Nova versão** → **Implantar**. A URL `/exec` só passa a refletir a nova permissão na nova versão.
5. Copie a URL que termina em `/exec` e configure no Angular (`proxy.conf.json` e, em produção, `environment.production.ts`).

## Teste rápido

Abra em uma **aba anônima** (sem estar logado no Google): `SUA_URL/exec?action=health` — deve aparecer JSON com `"ok":true`. Se abrir página de **login do Google** ou redirecionar para `accounts.google.com`, a implantação ainda não está como “Qualquer pessoa”.

## “Função de script não encontrada: doGet”

Isso aparece quando a **URL `/exec` que você colou no proxy** aponta para uma implantação cujo **projeto Apps Script não tem `function doGet(e)`** (arquivo vazio, projeto errado ou código antigo).

1. Abra **a planilha certa** → **Extensões → Apps Script** (abre o script **ligado** a ela).
2. No editor, garanta um arquivo (ex.: `Código.gs`) com **todo** o conteúdo de [`Code.gs`](Code.gs) deste repositório — precisa existir exatamente `function doGet(e)` e `function doPost(e)`.
3. **Salvar** o projeto (ícone de disco / Ctrl+S).
4. **Implantar → Gerenciar implantações** → edite o **Aplicativo da web** → **Versão: Nova versão** → **Implantar**, ou crie uma implantação nova e copie de novo a URL `/exec`.
5. Confira se o trecho entre `/macros/s/` e `/exec` no `proxy.conf.json` é **o da implantação desse** script (não de outro arquivo ou planilha).

Teste direto: `https://script.google.com/macros/s/SEU_ID/exec?action=health` — tem que retornar **JSON**, não página de erro do Apps Script.

## Erro 302 / CORS no Angular (`ServiceLogin`)

Se o console mostrar **CORS** em `accounts.google.com` após chamar `/gas`, é o **302 para login**. No repositório, `proxy.conf.json` está com **`followRedirects: true`** para o dev server seguir o redirect no Node (evita o navegador ir ao Google em XHR). **Reinicie o `ng serve`** após mudar o proxy.

Mesmo assim, sem **Qualquer pessoa** no deploy, a resposta pode ser HTML de login — o app detecta e exibe instruções. **Correção:** **Quem tem acesso** → **Qualquer pessoa** (ou **mesmo anônima**) → **Nova versão** → **Implantar**; teste `/exec?action=health` em aba anônima.

**Segurança:** com “qualquer pessoa”, quem tiver o link pode chamar a API. Para restringir depois, use token no `Code.gs`, lista de e-mails, ou evolua para OAuth no Angular (aí pode voltar a “só conta Google” no deploy, desde que o fluxo de auth trate o token/cookie corretamente).
