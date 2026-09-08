# Critérios objetivos para migrar de Google Sheets para SQL

Use esta lista como **gatilho de decisão**, não como regra automática. Quando **dois ou mais** itens estiverem verdadeiros de forma estável (por exemplo, por 1 mês), avalie Postgres / Supabase / outro banco relacional.

## Volume e desempenho

| Critério | Limiar sugerido | Medição |
|----------|-----------------|---------|
| Linhas totais na planilha principal | **> 15.000** linhas somadas nas abas transacionais | Contagem nas abas `Agendamentos` + `Clientes`. |
| Latência mediana da API (Apps Script) | **> 3 s** em mais de 20% das requisições em horário de pico | Log de tempo no Angular ou no script. |
| Erros por timeout / quota do Google | **> 5** por dia em dias normais | Revisão dos logs do Apps Script / feedback dos usuários. |

## Concorrência e consistência

| Critério | Limiar sugerido |
|----------|-----------------|
| Usuários **gravando ao mesmo tempo** (picos reais) | **≥ 3** pessoas frequentemente sobrescrevendo os mesmos recursos (agenda compartilhada, mesmo intervalo). |
| Conflitos perceptíveis | Relatos de “sumiu agendamento” ou “voltou valor antigo” **≥ 2** vezes por mês após auditoria na planilha. |

## Relatórios e analytics

| Critério | Limiar sugerido |
|----------|-----------------|
| Relatórios que exigem **joins** ou agregações pesadas | Mais de **3** relatórios recorrentes que hoje levam **> 30 s** ou precisam export manual repetido. |
| Necessidade de histórico imutável | Exigência de **auditoria** (quem alterou o quê e quando) além do que a planilha versionada suporta. |

## LGPD e segurança

| Critério | Limiar sugerido |
|----------|-----------------|
| Dados sensíveis | Tratamento de dados que exija **permissões por registro** (ex.: só certos perfis veem telefone/e-mail). |
| Retenção / exclusão | Processos formais de **eliminação** ou anonimização que não sejam práticos na planilha. |

## Manutenção

| Critério | Limiar sugerido |
|----------|-----------------|
| Abas espelho ou scripts frágeis | **≥ 2** cópias da mesma lógica “para não travar” a planilha. |
| Custo de desenvolvimento | Tempo da equipe em **workarounds** de Sheets **> 30%** do tempo de feature nova. |

## Registro da decisão

Quando migrar, documente: data, motivos (quais critérios), estratégia de **cópia ou sync** a partir das planilhas e plano de rollback.
