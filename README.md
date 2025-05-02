# GitHub PR Metrics Dashboard

Este projeto fornece um dashboard web simples para visualizar métricas de Pull Requests (PRs) de um repositório no GitHub Enterprise.

## Funcionalidades

- Busca PRs usando a API GraphQL do GitHub Enterprise.
- Filtra PRs por:
  - Autor
  - Aprovador
  - Branch de Destino
  - Status (OPEN, MERGED, CLOSED)
  - Intervalo de Datas (data de criação)
- Exclui PRs por:
  - Autor específico
  - Padrão de nome de branch (ex: `releases/**`)
- Calcula e exibe as seguintes métricas em gráficos:
  - Tempo para Primeira Revisão (Time to First Review)
  - Tempo em Draft (Time in Draft)
  - Contribuição do Revisor (Reviewer Contribution / Approval Count)
  - Tempo de Ciclo do PR (PR Cycle Time / Lead Time)
  - Tempo de Revisão (Review Time)
  - Tempo de Merge (Merge Time / Time to Merge)
  - Tamanho do PR (PR Size - linhas alteradas)
  - Número de Comentários por PR (Review Depth)
- Utiliza cache em memória para reduzir chamadas à API do GitHub.

## Estrutura de Pastas

.├── backend/│ ├── server.js # Servidor principal (Node.js) e endpoints da API│ ├── githubClient.js # Lógica para buscar dados da API do GitHub│ ├── metricsCalculator.js # Lógica para calcular as métricas│ ├── cache.js # Implementação do cache em memória│ ├── package.json # Dependências do backend│ └── .env # Arquivo de configuração (NÃO versionar)├── frontend/│ ├── index.html # Estrutura da página web│ ├── style.css # Estilos da página│ └── script.js # Lógica do frontend (chamadas API, gráficos)└── README.md # Este arquivo

## Setup

1.  **Pré-requisitos:**

    - Node.js (versão 22 ou superior recomendada)
    - npm (geralmente instalado com o Node.js)
    - Um token de acesso pessoal (PAT) do GitHub Enterprise com escopo `repo`.

2.  **Clonar o Repositório (se aplicável) ou Criar a Estrutura:**
    Crie as pastas `backend` e `frontend` conforme a estrutura acima.

3.  **Configurar Backend:**

    - Navegue até a pasta `backend`: `cd backend`
    - Instale as dependências: `npm install`
    - Crie um arquivo chamado `.env` na pasta `backend` e adicione as seguintes variáveis, substituindo os valores de exemplo pelos seus:

    ```dotenv
    # Token de Acesso Pessoal do GitHub com escopo 'repo'
    GITHUB_TOKEN=seu_github_pat_aqui

    # Nome do proprietário (usuário ou organização) do repositório
    GITHUB_REPO_OWNER=nome-do-dono

    # Nome do repositório
    GITHUB_REPO_NAME=nome-do-repo

    # Hostname da sua instância GitHub Enterprise (sem https://)
    # Exemplo: github.suaempresa.com
    GHE_HOSTNAME=seu.ghe.hostname.com

    # Porta para o servidor backend rodar (opcional, padrão 3000)
    PORT=3000
    ```

    **Importante:** Nunca adicione o arquivo `.env` ao controle de versão (Git).

4.  **Rodar o Projeto:**
    - Na pasta `backend`, inicie o servidor: `node server.js`
    - O servidor backend iniciará (por padrão na porta 3000).
    - Abra seu navegador e acesse `http://localhost:3000` (ou a porta configurada).

## Como Usar

1.  Acesse a aplicação no seu navegador.
2.  Use os campos de filtro para selecionar os PRs desejados (intervalo de datas, autor, aprovador, etc.).
3.  Clique no botão "Atualizar Métricas" ou similar.
4.  Os gráficos e dados serão atualizados com base nos filtros aplicados.

## Observações

- O cálculo do "Tempo de Ciclo do PR" considera o tempo desde a criação do PR até o merge. Uma medição mais precisa (desde o primeiro commit) exigiria consultas adicionais à API do GitHub, aumentando a complexidade.
- O cache é baseado em memória e será limpo quando o servidor for reiniciado.
- A performance da busca inicial pode depender do número de PRs e da velocidade da API do GitHub Enterprise.
