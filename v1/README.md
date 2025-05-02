# GitHub PR Dashboard (Local)

Um projeto simples de frontend e backend para buscar, filtrar e exibir métricas de Pull Requests de um repositório do GitHub Enterprise usando a API GraphQL.

## Funcionalidades

- Busca PRs de um repositório específico no GitHub Enterprise.
- Filtra PRs por intervalo de datas (padrão: últimos 30 dias).
- Filtra PRs (no lado do cliente) por:
  - Autor
  - Exclusão de Autor
  - Aprovador
  - Branch de Destino
- Calcula e exibe várias métricas por PR e agregadas.
- Minimiza chamadas à API GraphQL buscando PRs em páginas.

## Métricas Calculadas

- **Time to First Review:** Tempo desde que o PR ficou pronto para revisão até a primeira revisão (excluindo autor).
- **Time in Draft:** Tempo que o PR passou no estado "Draft".
- **Reviewer Contribution / Approval Count:** Contagem de quantos PRs cada pessoa aprovou.
- **PR Cycle Time / Lead Time:** Tempo desde o _primeiro commit_ relacionado ao PR até o merge.
- **Review Time:** Tempo desde a _primeira revisão_ até o merge.
- **Merge Time / Time to Merge:** Tempo desde a _última aprovação_ até o merge.
- **PR Size:** Linhas de código alteradas (adições + exclusões) e número de arquivos.
- **Review Depth:** Contagem total de comentários em revisões.

## Requisitos

- Node.js (v16 ou superior recomendado)
- npm (geralmente vem com o Node.js)
- WSL2 (se rodando no Windows)
- Um [Personal Access Token (Classic)](https://docs.github.com/en/enterprise-server@latest/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) do seu GitHub Enterprise com escopo `repo` (ou um Fine-Grained PAT com permissões de leitura para repositórios, metadados e pull requests).

## Setup e Execução (Dentro do WSL2)

1.  **Clone o Repositório:**

    ```bash
    git clone <url-do-seu-repositorio>
    cd github-pr-dashboard
    ```

2.  **Configure as Variáveis de Ambiente:**

    - Navegue até o diretório `backend`:
      ```bash
      cd backend
      ```
    - Copie o arquivo de exemplo:
      ```bash
      cp .env.example .env
      ```
    - Edite o arquivo `.env` com um editor de texto (como `nano` ou `vim`) e preencha as variáveis com seus dados:
      - `GITHUB_TOKEN`: Seu Personal Access Token.
      - `GITHUB_REPO_OWNER`: O nome do usuário ou organização dona do repositório.
      - `GITHUB_REPO_NAME`: O nome do repositório.
      - `GHE_HOSTNAME`: O hostname do seu GitHub Enterprise (ex: `github.suaempresa.com`).
      - `PORT` (Opcional): Porta para o servidor backend rodar (padrão 3000).

3.  **Instale as Dependências do Backend:**

    - Ainda no diretório `backend/`:
      ```bash
      npm install
      ```

4.  **Inicie o Servidor Backend:**

    - Ainda no diretório `backend/`:
      ```bash
      npm start
      ```
    - O servidor backend estará rodando (por padrão em `http://localhost:3000`). Você verá logs no terminal indicando que ele iniciou.

5.  **Acesse o Frontend:**

    - Abra seu navegador (no Windows ou dentro do WSL2 se tiver interface gráfica).
    - Acesse a URL onde o backend está servindo o frontend: `http://localhost:3000` (ou a porta que você definiu).

6.  **Utilize a Interface:**
    - Selecione o intervalo de datas desejado.
    - Clique em "Buscar e Filtrar PRs".
    - Utilize os campos de texto para filtrar os resultados exibidos. Os filtros de texto são aplicados dinamicamente aos dados já carregados.

## Como Funciona

1.  O **Frontend** (`frontend/index.html`, `script.js`, `style.css`) é servido estaticamente pelo backend.
2.  Quando você clica em "Buscar e Filtrar PRs", o `script.js` faz uma requisição para o **Backend** (`backend/server.js`) na rota `/api/prs`, passando as datas selecionadas como query parameters.
3.  O **Backend** recebe a requisição, lê as variáveis de ambiente do `.env`.
4.  Ele constrói e executa uma ou mais queries **GraphQL** para a API do GitHub Enterprise (`https://{GHE_HOSTNAME}/api/graphql`) para buscar os PRs recentes (paginados), incluindo detalhes como autor, status, datas, revisões, timeline e commits iniciais.
5.  O Backend filtra os PRs pelo **intervalo de datas** fornecido.
6.  Para cada PR filtrado, ele chama as funções em `backend/metrics.js` para calcular as métricas definidas.
7.  O Backend envia a lista de PRs (com suas métricas) de volta para o Frontend como JSON.
8.  O `script.js` no Frontend recebe os dados, aplica os **filtros de texto** (Autor, Aprovador, etc.) no lado do cliente, calcula métricas agregadas e atualiza a tabela e o resumo na página HTML.

## Considerações

- **Performance:** Buscar e processar centenas ou milhares de PRs pode ser lento e consumir recursos da API. A paginação no backend limita o número de PRs buscados por chamada, mas buscar muitos dados (especialmente `timelineItems`) pode demorar. O limite atual de páginas no backend (`maxPages`) evita loops infinitos ou consumo excessivo.
- **Rate Limits:** A API GraphQL do GitHub tem limites de taxa. Se você fizer muitas requisições rapidamente, pode encontrar erros. O projeto atual tenta minimizar isso buscando 100 PRs por vez.
- **Precisão das Métricas:** Algumas métricas (como Cycle Time baseado no "primeiro commit") dependem da disponibilidade e precisão dos dados da API. A query busca os primeiros commits, mas a lógica exata pode precisar de ajustes dependendo do seu fluxo de trabalho.
- **Segurança:** Mantenha seu `GITHUB_TOKEN` seguro e não o adicione ao controle de versão (o `.gitignore` padrão do Node geralmente inclui `.env`).
