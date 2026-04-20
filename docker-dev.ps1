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

$AppPath = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $AppPath "App"

# Colores
$Green = 32
$Red = 31
$Yellow = 33
$Cyan = 36

function Write-Color {
    param($Message, $Color = $Cyan)
    Write-Host $Message -ForegroundColor $Color
}

function Show-Help {
    Write-Color "
╔════════════════════════════════════════════════════════════════╗
║       ShowDeal Docker - Quick Start Helper                    ║
╚════════════════════════════════════════════════════════════════╝

USAGE:
  .\docker-dev.ps1 [command] [flags]

COMMANDS:
  up              Levantar servicios (default)
  down            Detener servicios
  logs            Ver logs (app + db + redis)
  shell           Entrar a shell de app
  db              Conectar a PostgreSQL
  clean           Limpiar todo (borra volúmenes)
  build           Build imagen Docker
  
FLAGS:
  -Build          Rebuild imagen antes de levantar
  -Logs_App       Ver solo logs de app
  -Logs_Db        Ver solo logs de postgres
  -Logs_Redis     Ver solo logs de redis
  -h, -Help       Mostrar esta ayuda

EXAMPLES:
  # Levantar servicios
  .\docker-dev.ps1 up
  
  # Levantar con rebuild
  .\docker-dev.ps1 up -Build
  
  # Ver logs de app
  .\docker-dev.ps1 logs -Logs_App
  
  # Entrar a shell
  .\docker-dev.ps1 shell
  
  # Conectar a BD
  .\docker-dev.ps1 db
  
  # Limpiar todo
  .\docker-dev.ps1 clean

STATUS CHECKS:
  Health:    curl http://localhost:3000/health
  Frontend:  http://localhost:3000
  Prisma:    docker-compose exec app npx prisma studio
  
COMMON TASKS:
  Check services:
    docker-compose ps
  
  Rebuild image:
    docker-compose up -d --build
  
  Reset database:
    docker-compose down -v
    docker-compose up -d
  
  View DB:
    docker-compose exec app npx prisma studio
    # http://localhost:5555
    
  Enter app container:
    docker-compose exec app sh
    
For more info, see DOCKER.md
    " -Color $Cyan
}

function Start-Stack {
    Write-Color "🚀 Starting ShowDeal stack..." -Color $Cyan
    
    if ($Build) {
        Write-Color "📦 Building image..." -Color $Yellow
        docker-compose -f $AppDir/docker-compose.yml build
    }
    
    Push-Location $AppDir
    docker-compose up -d
    Pop-Location
    
    Write-Color "✅ Services started!" -Color $Green
    Write-Color "
📍 Endpoints:
   Frontend:     http://localhost:3000
   Health:       http://localhost:3000/health
   API:          http://localhost:3000
   PostgreSQL:   localhost:5432
   Redis:        localhost:6379
    " -Color $Green
    
    Write-Color "⏳ Waiting for services to be ready (30-40s)..." -Color $Yellow
    Start-Sleep -Seconds 5
    docker-compose ps
}

function Stop-Stack {
    Write-Color "🛑 Stopping services..." -Color $Yellow
    Push-Location $AppDir
    docker-compose down
    Pop-Location
    Write-Color "✅ Stopped!" -Color $Green
}

function Show-Logs {
    Write-Color "📋 Showing logs..." -Color $Cyan
    Push-Location $AppDir
    
    if ($Logs_App) {
        docker-compose logs -f app
    } elseif ($Logs_Db) {
        docker-compose logs -f postgres
    } elseif ($Logs_Redis) {
        docker-compose logs -f redis
    } else {
        docker-compose logs -f
    }
    
    Pop-Location
}

function Enter-Shell {
    Write-Color "📦 Entering app container shell..." -Color $Cyan
    Push-Location $AppDir
    docker-compose exec app sh
    Pop-Location
}

function Connect-Database {
    Write-Color "🗄️ Connecting to PostgreSQL..." -Color $Cyan
    Push-Location $AppDir
    docker-compose exec postgres psql -U showdeal -d showdeal
    Pop-Location
}

function Clean-All {
    Write-Color "🧹 Cleaning all data (DESTRUCTIVE)..." -Color $Red
    $confirm = Read-Host "Are you sure? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "yes") {
        Write-Color "Removing containers and volumes..." -Color $Yellow
        Push-Location $AppDir
        docker-compose down -v
        Pop-Location
        Write-Color "✅ Cleaned!" -Color $Green
    } else {
        Write-Color "Cancelled" -Color $Yellow
    }
}

function Build-Image {
    Write-Color "🏗️ Building Docker image..." -Color $Cyan
    Push-Location $AppDir
    docker-compose build
    Pop-Location
    Write-Color "✅ Build complete!" -Color $Green
}

# Main logic
if ($Help) {
    Show-Help
    exit 0
}

# Verificar que docker-compose existe
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Color "❌ docker-compose not found! Please install Docker Desktop" -Color $Red
    exit 1
}

if (-not (Test-Path $AppDir)) {
    Write-Color "❌ App directory not found: $AppDir" -Color $Red
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
    default {
        Show-Help
    }
}
