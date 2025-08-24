@echo off
echo ========================================
echo Substituindo conteudo do backend pelo backend_dev
echo ========================================
echo.

REM Verificar se estamos em um repositorio Git
if not exist ".git" (
    echo ERRO: Este diretorio nao e um repositorio Git!
    echo Certifique-se de executar este script dentro do repositorio backend
    pause
    exit /b 1
)

echo Passo 1: Adicionando repositorio backend_dev como remoto temporario...
git remote add devrepo https://github.com/augleao/backend_dev.git
if %errorlevel% neq 0 (
    echo Remoto ja existe ou erro ao adicionar. Continuando...
)

echo.
echo Passo 2: Buscando conteudo do backend_dev...
git fetch devrepo
if %errorlevel% neq 0 (
    echo ERRO: Falha ao buscar conteudo do backend_dev
    pause
    exit /b 1
)

echo.
echo Passo 3: Substituindo conteudo atual pelo do backend_dev...
echo ATENCAO: Isso vai sobrescrever todo o conteudo atual!
git reset --hard devrepo/main

git reset --hard devrepo/main
if %errorlevel% neq 0 (
    echo ERRO: Falha ao substituir conteudo
    pause
    exit /b 1
)

echo.
echo Passo 4: Enviando alteracoes para o repositorio backend remoto...
echo ATENCAO: Isso vai sobrescrever o historico do repositorio remoto!
git push origin main --force

git push origin main --force
if %errorlevel% neq 0 (
    echo ERRO: Falha ao enviar alteracoes
    pause
    exit /b 1
)

echo.
echo Passo 5: Removendo remoto temporario...
git remote remove devrepo

echo.
echo ========================================
echo SUCESSO! Conteudo substituido com sucesso!
echo O repositorio backend agora tem o mesmo conteudo do backend_dev
echo ========================================
pause
