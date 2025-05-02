Crie um projeto backend-frontend com as seguintes características.

Funcionalides

- Filtrar PRs por Autor, Aprovador, branch destino, status do PR
- Filter out Autor, por branch name pattern (releases/\*\*)
- Plotar um gráfico para cada uma das métricas solicitadas.

Requisitos

- Deve ser feito usando a api de GraphQL do GH Enterprise
- O frontend não deve utilizar nenhum framework
- A estrutura de pastas deve ser simples. Evite criar muitos arquivos. Sugiro dividir entre backend e frontend. No backend, utilize um arquivo para cada responsabilidade (acessa gh, calcular métricas e servir a api e o front), no frontend apenas 3 arquivos (script.js, index.html e style.css)
- A versão do NodeJS que roda na minha máquina é 22
- Deve mostrar qual o setup pra rodar o projeto
- Deve buscar no arquivo .env(utilizando dotenv) as variáveis de ambiente pro projeto
      -  GITHUB_TOKEN
      -  GITHUB_REPO_OWNER
      -  GITHUB_REPO_NAME
      -  GHE_HOSTNAME ("my.git.server.com")
- Hoje o repositório possui entre 500 e 1000 PRs. Deve haver um seleter de intervalo de datas para o usuário. O padrão pode ser 30 dias.
- Faça uma cache dos dados do GitHub para evitar ficar fazendo requests desnecessária ao GitHub
- Mande os arquivos separados

Métricas

- Quanto tempo um PR fica aberto aguardando revisão (Time to First Review)
- Quanto tempo um PR fica em draft antes de ser de fato aberto (Time in Draft)
- Quantas PRs cada pessoa aprova (Reviewer Contribution / Approval Count)
- Tempo de Ciclo do PR (PR Cycle Time / Lead Time): Tempo total desde o primeiro commit relacionado ao PR até o merge na branch principal. Mede todo o - fluxo.
- Tempo de Revisão (Review Time): Tempo desde a primeira revisão até a aprovação final/merge. Indica quanto tempo leva a discussão e os ajustes - pós-revisão inicial.
- Tempo de Merge (Merge Time / Time to Merge): Tempo desde a aprovação final até o PR ser efetivamente mergeado. Tempos longos aqui podem indicar - problemas no processo de merge ou na esteira de CI/CD.
- Tamanho do PR (PR Size): Medido em linhas de código alteradas (adições + exclusões) ou número de arquivos modificados. PRs menores tendem a ser - revisados e mergeados mais rapidamente.
- Número de Comentários por PR (Review Depth): Média de comentários por PR pode indicar o nível de detalhe das revisões ou a complexidade/qualidade - inicial do código.
