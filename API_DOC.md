# Documentação das APIs - backend_dev

## Autenticação e Usuário
- **POST /api/signup**
  - Cria um novo usuário.
- **POST /api/login**
  - Realiza login e retorna token JWT.
- **GET /api/profile**
  - Retorna dados do usuário autenticado.

## Atos e Atos Pagos
- **GET /api/atos**
  - Lista todos os atos.
- **GET /api/atos/:id**
  - Busca um ato pelo ID.
- **POST /api/atos**
  - Cria um novo ato (requer autenticação e permissão de registrador).
- **PUT /api/atos/:id**
  - Atualiza um ato existente.
- **GET /api/atos-pagos**
  - Lista todos os atos pagos.
- **POST /api/atos-pagos**
  - Cria um novo registro de ato pago.
- **DELETE /api/atos-pagos/:id**
  - Remove um ato pago pelo ID.

## Atos Praticados
- **GET /api/atos-praticados**
  - Lista atos praticados.
- **POST /api/atos-praticados**
  - Cria um novo registro de ato praticado.

## Atos Tabela
- **GET /api/atos-tabela**
  - Lista a tabela de atos.
- **POST /api/atos-tabela**
  - Adiciona um novo item à tabela de atos.
- **DELETE /api/atos-tabela/:id**
  - Remove um item da tabela de atos.

## Importação e Upload
- **POST /api/importar-atos-pdf**
  - Importa atos a partir de arquivos PDF.
- **POST /api/upload**
  - Faz upload de arquivos (autenticado).

## Execução de Serviço e Selos
- **POST /api/execucao-servico**
  - Cria uma execução de serviço.
- **GET /api/execucao-servico/:protocolo**
  - Busca execução de serviço por protocolo.
- **PUT /api/execucao-servico/:id**
  - Atualiza execução de serviço.
- **POST /api/execucaoservico/:execucaoId/selo**
  - Faz upload de selo eletrônico para uma execução.
- **GET /api/execucao-servico/:execucaoId/selos**
  - Lista selos de uma execução.
- **DELETE /api/execucao-servico/:execucaoId/selo/:seloId**
  - Remove um selo de uma execução.

## Admin/Render/Postgres (Backup e Exportação)
- **GET /api/admin/render/services**
  - Lista serviços do Render.
- **POST /api/admin/render/services/:serviceId/backup**
  - Cria backup de um serviço no Render.
- **GET /api/admin/render/postgres**
  - Lista bancos Postgres do Render.
- **GET /api/admin/render/postgres/:postgresId/exports**
  - Lista exports de um banco Postgres.
- **POST /api/admin/render/postgres/:postgresId/export**
  - Solicita exportação de um banco Postgres.
- **POST /admin/render/postgres/:postgresId/recovery**
  - Dispara backup automático (recovery) para um banco Postgres.

## Backup Agendado
- **GET /api/:postgresId/backup-agendado**
  - Busca configuração de backup agendado para um banco.
- **POST /api/:postgresId/backup-agendado**
  - Cria ou atualiza configuração de backup agendado.
