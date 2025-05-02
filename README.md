# GitHub PR Metrics Dashboard

**Propósito:** Visualizar métricas chave de Pull Requests (PRs) de um repositório específico no GitHub Enterprise para análise de performance e fluxo de desenvolvimento.

## Visão Geral

Este dashboard web permite buscar, filtrar e analisar dados de PRs, apresentando métricas agregadas em gráficos e detalhes individuais em uma tabela interativa. Ele se conecta à API GraphQL do GitHub Enterprise e possui um backend Node.js simples e um frontend em HTML/CSS/JavaScript puro.

## Funcionalidades Principais

- **Busca de Dados:** Conecta-se ao GitHub Enterprise via API GraphQL.
- **Cache:** Utiliza cache em memória no backend para otimizar chamadas repetidas à API.
- **Filtragem:** Permite filtrar PRs por autor, aprovador, branch destino, status e intervalo de datas. Também permite excluir PRs por autor ou padrão de branch.
- **Métricas Calculadas:**
  - Tempo para Primeira Revisão (Time to First Review)
  - Tempo em Draft (Time in Draft)
  - Contribuição do Revisor (Reviewer Contribution / Approval Count)
  - Tempo de Ciclo do PR (PR Cycle Time / Lead Time)
  - Tempo de Revisão (Review Time)
  - Tempo de Merge (Merge Time / Time to Merge)
  - Tamanho do PR (PR Size - linhas alteradas)
  - Número Total de Comentários por PR (Review Depth)
- **Visualização:**
  - Gráficos agregados (histogramas/barras) para as métricas.
  - Tabela detalhada por PR (mostrada/ocultada dinamicamente).
  - Controle de visibilidade de colunas na tabela de detalhes (salvo localmente).
  - Alternância entre tema claro e escuro (salvo localmente).
- **Filtros Padrão:** Carrega inicialmente com filtros pré-definidos (Status: Merged, Excluir Autor: dependabot, Branch Destino: main, Período: últimos 30 dias).

## Tecnologias Utilizadas

- **Backend:** Node.js (v22+), `dotenv`
- **Frontend:** HTML5, CSS3, JavaScript (ES Modules), Chart.js, date-fns
- **API:** GitHub Enterprise GraphQL API

## Executando o Projeto

1.  **Pré-requisitos:**

    - Node.js (v22 ou superior)
    - npm
    - Token de Acesso Pessoal (PAT) do GitHub Enterprise com escopo `repo`.

2.  **Configuração:**

    - Navegue até a pasta `backend`: `cd backend`
    - Instale as dependências: `npm install`
    - Crie um arquivo `.env` na pasta `backend` (pode copiar do `.env.example` se houver) e preencha as variáveis:
      - `GITHUB_TOKEN`: Seu PAT do GitHub.
      - `GITHUB_REPO_OWNER`: Dono do repositório (usuário/organização).
      - `GITHUB_REPO_NAME`: Nome do repositório.
      - `GHE_HOSTNAME`: Hostname da sua instância GHE (ex: `github.suaempresa.com`).
      - `PORT` (Opcional): Porta para o servidor (padrão: 3000).
    - **Importante:** Adicione `.env` ao seu arquivo `.gitignore`.

3.  **Inicialização:**
    - Ainda na pasta `backend`, execute: `node server.js`
    - Acesse `http://localhost:3000` (ou a porta configurada) no seu navegador.

## Entendendo as Métricas

- **Tempo para Primeira Revisão:** Tempo desde que o PR ficou pronto para revisão até a primeira ação de revisão (aprovação, pedido de alteração, comentário de revisão).
- **Tempo em Draft:** Tempo que um PR passou no estado "Draft" antes de ser marcado como "Ready for Review".
- **Contribuição do Revisor:** Contagem de quantos PRs cada pessoa aprovou.
- **Tempo de Ciclo do PR (Lead Time):** Tempo total desde a criação do PR até o merge na branch principal.
- **Tempo de Revisão:** Tempo desde a primeira revisão até a aprovação final ou merge.
- **Tempo de Merge:** Tempo desde a aprovação final até o PR ser efetivamente mergeado.
- **Tamanho do PR:** Soma das linhas adicionadas e excluídas.
- **Número Total de Comentários:** Soma dos comentários gerais no PR e dos comentários feitos em revisões específicas.

## Limitações e Observações

- **Cache:** O cache do backend é em memória e reinicia com o servidor.
- **Paginação da API:** A busca de revisões e comentários dentro da consulta GraphQL principal é limitada (ex: `first: 50`). PRs com um número muito grande de revisões podem ter a contagem de comentários ou a identificação de aprovadores incompleta.
- **Performance:** Para repositórios com dezenas de milhares de PRs, a busca inicial e o processamento podem levar mais tempo.
