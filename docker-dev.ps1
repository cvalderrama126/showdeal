#!/usr/bin/env pwsh

# ============================================
# ShowDeal Docker Quick Start (Windows PowerShell)
# ============================================
# Script para facilitar inicio rápido con Docker

param(
    [string]$Command = "up",
    [switch]$Build,
    [switch]$Down,
    [switch]$Logs,
    [switch]$Logs_Db,
    [switch]$Logs_Redis,
    [switch]$Logs_App,
    [switch]$Shell,
    [switch]$Db,
    [switch]$Clean,
    [switch]$Help
)

$RepoRoot = $PSScriptRoot
$AppDir = Join-Path $RepoRoot "App"
$UseDockerComposePlugin = $false

# Colores (ConsoleColor names for PowerShell compatibility)
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-Color {
    param($Message, $Color = $Cyan)
    Write-Host $Message -ForegroundColor $Color
}

function Show-Help {
        $help = @'
===============================================================
    ShowDeal Docker - Quick Start Helper
===============================================================

USAGE:
    ./docker-dev.ps1 [command] [flags]

COMMANDS:
    up              Levantar servicios (default)
    down            Detener servicios
    logs            Ver logs (app + db + redis)
    wizard          Asistente interactivo para configurar DB/admin
    shell           Entrar a shell de app
    db              Conectar a PostgreSQL
    clean           Limpiar todo (borra volumenes)
    build           Build imagen Docker

FLAGS:
    -Build          Rebuild imagen antes de levantar
    -Logs_App       Ver solo logs de app
    -Logs_Db        Ver solo logs de postgres
    -Logs_Redis     Ver solo logs de redis
    -h, -Help       Mostrar esta ayuda

EXAMPLES:
    ./docker-dev.ps1 up
    ./docker-dev.ps1 up -Build
    ./docker-dev.ps1 logs -Logs_App
    ./docker-dev.ps1 shell
    ./docker-dev.ps1 db
    ./docker-dev.ps1 wizard

STATUS CHECKS:
    Health:    curl http://localhost:3000/health
    Frontend:  http://localhost:3000
    Prisma:    docker compose exec app npx prisma studio

COMMON TASKS:
    docker compose ps
    docker compose up -d --build
    docker compose down -v
    docker compose exec app sh

For more info, see DOCKER.md
'@

        Write-Color $help -Color $Cyan
}

function Invoke-Compose {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ComposeArgs
    )

    if ($UseDockerComposePlugin) {
        & docker compose @ComposeArgs
    } else {
        & docker-compose @ComposeArgs
    }
}

function Start-Stack {
    Write-Color "Starting ShowDeal stack..." -Color $Cyan
    
    if ($Build) {
        Write-Color "Building image..." -Color $Yellow
        Invoke-Compose -ComposeArgs @("-f", "$AppDir/docker-compose.yml", "build")
    }
    
    Push-Location $AppDir
    Invoke-Compose -ComposeArgs @("up", "-d")
    Pop-Location
    
    Write-Color "Services started!" -Color $Green
    Write-Color "
Endpoints:
   Frontend:     http://localhost:3000
   Health:       http://localhost:3000/health
   API:          http://localhost:3000
   PostgreSQL:   localhost:5432
   Redis:        localhost:6379
    " -Color $Green
    
    Write-Color "Waiting for services to be ready (30-40s)..." -Color $Yellow
    Start-Sleep -Seconds 5
    Invoke-Compose -ComposeArgs @("ps")
}

function Stop-Stack {
    Write-Color "Stopping services..." -Color $Yellow
    Push-Location $AppDir
    Invoke-Compose -ComposeArgs @("down")
    Pop-Location
    Write-Color "Stopped!" -Color $Green
}

function Show-Logs {
    Write-Color "Showing logs..." -Color $Cyan
    Push-Location $AppDir
    
    if ($Logs_App) {
        Invoke-Compose -ComposeArgs @("logs", "-f", "app")
    } elseif ($Logs_Db) {
        Invoke-Compose -ComposeArgs @("logs", "-f", "postgres")
    } elseif ($Logs_Redis) {
        Invoke-Compose -ComposeArgs @("logs", "-f", "redis")
    } else {
        Invoke-Compose -ComposeArgs @("logs", "-f")
    }
    
    Pop-Location
}

function Enter-Shell {
    Write-Color "Entering app container shell..." -Color $Cyan
    Push-Location $AppDir
    Invoke-Compose -ComposeArgs @("exec", "app", "sh")
    Pop-Location
}

function Connect-Database {
    Write-Color "Connecting to PostgreSQL..." -Color $Cyan
    Push-Location $AppDir
    Invoke-Compose -ComposeArgs @("exec", "postgres", "psql", "-U", "showdeal", "-d", "showdeal")
    Pop-Location
}

function Clean-All {
    Write-Color "Cleaning all data (DESTRUCTIVE)..." -Color $Red
    $confirm = Read-Host "Are you sure? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "yes") {
        Write-Color "Removing containers and volumes..." -Color $Yellow
        Push-Location $AppDir
        Invoke-Compose -ComposeArgs @("down", "-v")
        Pop-Location
        Write-Color "Cleaned!" -Color $Green
    } else {
        Write-Color "Cancelled" -Color $Yellow
    }
}

function Build-Image {
    Write-Color "Building Docker image..." -Color $Cyan
    Push-Location $AppDir
    Invoke-Compose -ComposeArgs @("build")
    Pop-Location
    Write-Color "Build complete!" -Color $Green
}

function Start-Wizard {
    $WizardPath = Join-Path $PSScriptRoot "docker-wizard.ps1"
    if (-not (Test-Path $WizardPath)) {
        Write-Color "Wizard not found: $WizardPath" -Color $Red
        exit 1
    }

    Write-Color "Starting setup wizard..." -Color $Cyan
    & $WizardPath
}

# Main logic
if ($Help) {
    Show-Help
    exit 0
}

# Verificar disponibilidad de Docker Compose (plugin o comando clasico)
$composeRequired = @("up", "down", "logs", "shell", "db", "clean", "build") -contains $Command.ToLower()

$hasPlugin = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        & docker compose version | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $hasPlugin = $true
        }
    } catch {
    }
}

$hasStandalone = $null -ne (Get-Command docker-compose -ErrorAction SilentlyContinue)

if ($composeRequired -and -not $hasPlugin -and -not $hasStandalone) {
    Write-Color "Docker Compose no disponible. Instala Docker Desktop o docker compose plugin." -Color $Red
    exit 1
}

$UseDockerComposePlugin = $hasPlugin

if (-not (Test-Path $AppDir)) {
    Write-Color "App directory not found: $AppDir" -Color $Red
    exit 1
}

# Ejecutar comando
switch ($Command.ToLower()) {
    "up" {
        Start-Stack
    }
    "down" {
        Stop-Stack
    }
    "logs" {
        Show-Logs
    }
    "shell" {
        Enter-Shell
    }
    "db" {
        Connect-Database
    }
    "clean" {
        Clean-All
    }
    "build" {
        Build-Image
    }
    "wizard" {
        Start-Wizard
    }
    default {
        Show-Help
    }
}
