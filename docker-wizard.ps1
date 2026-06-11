#!/usr/bin/env pwsh

# ShowDeal Docker Setup Wizard
# Configura App/.env.docker con datos personalizados para DB y admin.

[CmdletBinding()]
param(
    [switch]$StartAfterSetup,
    [switch]$ResetVolumes,
    [switch]$NonInteractive,
    [string]$DbUser,
    [string]$DbPassword,
    [string]$DbName,
    [int]$DbPort,
    [string]$AdminEmail,
    [string]$AdminFullName,
    [string]$AdminPhone,
    [string]$AdminPassword,
    [string]$AdminPasswordHash
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "App"
$EnvFile = Join-Path $AppDir ".env.docker"
$EnvTemplate = Join-Path $AppDir ".env.example"

if (-not (Test-Path $AppDir)) {
    throw "No se encontro la carpeta App en: $RepoRoot"
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-WarnText {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Get-EnvValue {
    param(
        [string[]]$Lines,
        [string]$Key,
        [string]$DefaultValue = ""
    )

    foreach ($line in $Lines) {
        if ($line -match "^\s*$Key=(.*)$") {
            return $matches[1].Trim()
        }
    }

    return $DefaultValue
}

function Set-EnvValue {
    param(
        [string[]]$Lines,
        [string]$Key,
        [string]$Value
    )

    $updated = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match "^\s*$Key=") {
            $Lines[$i] = "$Key=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $Lines += "$Key=$Value"
    }

    return ,$Lines
}

function Read-WizardValue {
    param(
        [string]$Label,
        [string]$CurrentValue,
        [switch]$Mandatory,
        [switch]$Secret
    )

    while ($true) {
        $prompt = if ($CurrentValue) { "$Label [$CurrentValue]" } else { $Label }

        if ($Secret) {
            $secure = Read-Host $prompt -AsSecureString
            $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try {
                $text = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            } finally {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
            }
        } else {
            $text = Read-Host $prompt
        }

        if ([string]::IsNullOrWhiteSpace($text)) {
            if (-not $Mandatory) {
                return $CurrentValue
            }
            if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
                return $CurrentValue
            }
            Write-WarnText "Este campo es obligatorio."
            continue
        }

        return $text.Trim()
    }
}

function New-BcryptHash {
    param(
        [string]$PlainPassword,
        [string]$WorkingDirectory
    )

    if ([string]::IsNullOrWhiteSpace($PlainPassword)) {
        return $null
    }

    try {
        $nodeCmd = Get-Command node -ErrorAction Stop
        if (-not $nodeCmd) {
            return $null
        }

        $script = @"
const bcrypt = require('bcryptjs');
const password = process.argv[1];
bcrypt.hash(password, 10)
  .then((h) => { console.log(h); })
  .catch((err) => { console.error(err.message); process.exit(1); });
"@

        $hash = & node -e $script $PlainPassword 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }

        $value = ($hash | Select-Object -First 1).Trim()
        if ($value -match '^\$2[aby]\$') {
            return $value
        }

        return $null
    } catch {
        return $null
    }
}

function Initialize-EnvFile {
    if (Test-Path $EnvFile) {
        return
    }

    if (Test-Path $EnvTemplate) {
        Copy-Item -Path $EnvTemplate -Destination $EnvFile -Force
        Write-Info "Se creo App/.env.docker usando .env.example"
        return
    }

    throw "No se encontro App/.env.docker ni App/.env.example para inicializar la configuracion."
}

Initialize-EnvFile
$lines = Get-Content -Path $EnvFile

$currentDbUser = Get-EnvValue -Lines $lines -Key "DB_USER" -DefaultValue "showdeal"
$currentDbPassword = Get-EnvValue -Lines $lines -Key "DB_PASSWORD" -DefaultValue "showdeal_dev_password"
$currentDbName = Get-EnvValue -Lines $lines -Key "DB_NAME" -DefaultValue "showdeal"
$currentDbPort = Get-EnvValue -Lines $lines -Key "DB_PORT" -DefaultValue "5432"
$currentAdminEmail = Get-EnvValue -Lines $lines -Key "ADMIN_EMAIL" -DefaultValue "admin@showdeal.com"
$currentAdminFullName = Get-EnvValue -Lines $lines -Key "ADMIN_FULL_NAME" -DefaultValue "Admin User"
$currentAdminPhone = Get-EnvValue -Lines $lines -Key "ADMIN_PHONE" -DefaultValue "+1-555-0000"
$currentAdminPasswordHash = Get-EnvValue -Lines $lines -Key "ADMIN_PASSWORD_HASH" -DefaultValue '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4JlFm'

Write-Info ""
Write-Info "=============================================="
Write-Info "   ShowDeal Docker Setup Wizard"
Write-Info "=============================================="
Write-Info "Configuraras usuario/clave de PostgreSQL y admin inicial."
Write-Info ""

if ($NonInteractive) {
    if (-not $DbUser) { $DbUser = $currentDbUser }
    if (-not $DbPassword) { $DbPassword = $currentDbPassword }
    if (-not $DbName) { $DbName = $currentDbName }
    if (-not $DbPort) { $DbPort = [int]$currentDbPort }
    if (-not $AdminEmail) { $AdminEmail = $currentAdminEmail }
    if (-not $AdminFullName) { $AdminFullName = $currentAdminFullName }
    if (-not $AdminPhone) { $AdminPhone = $currentAdminPhone }

    if ($AdminPasswordHash) {
        $finalAdminHash = $AdminPasswordHash
    } elseif ($AdminPassword) {
        $computed = New-BcryptHash -PlainPassword $AdminPassword -WorkingDirectory $AppDir
        $finalAdminHash = if ($computed) { $computed } else { $currentAdminPasswordHash }
    } else {
        $finalAdminHash = $currentAdminPasswordHash
    }
} else {
    $DbUser = Read-WizardValue -Label "DB_USER" -CurrentValue $currentDbUser -Mandatory
    $DbPassword = Read-WizardValue -Label "DB_PASSWORD" -CurrentValue $currentDbPassword -Mandatory -Secret
    $DbName = Read-WizardValue -Label "DB_NAME" -CurrentValue $currentDbName -Mandatory

    $portInput = Read-WizardValue -Label "DB_PORT" -CurrentValue $currentDbPort -Mandatory
    if (-not [int]::TryParse($portInput, [ref]$DbPort)) {
        Write-WarnText "Puerto invalido. Se usara valor actual: $currentDbPort"
        $DbPort = [int]$currentDbPort
    }

    $AdminEmail = Read-WizardValue -Label "ADMIN_EMAIL" -CurrentValue $currentAdminEmail -Mandatory
    $AdminFullName = Read-WizardValue -Label "ADMIN_FULL_NAME" -CurrentValue $currentAdminFullName -Mandatory
    $AdminPhone = Read-WizardValue -Label "ADMIN_PHONE" -CurrentValue $currentAdminPhone -Mandatory

    Write-Info ""
    Write-Info "Contrasena del admin inicial"
    Write-Info "- Enter vacio para mantener hash actual"
    Write-Info "- Si escribes una clave, el wizard intentara generar bcrypt hash"
    $AdminPassword = Read-WizardValue -Label "ADMIN_PASSWORD (texto plano, opcional)" -CurrentValue "" -Secret

    if (-not [string]::IsNullOrWhiteSpace($AdminPassword)) {
        $generatedHash = New-BcryptHash -PlainPassword $AdminPassword -WorkingDirectory $AppDir
        if ($generatedHash) {
            Write-Ok "Hash bcrypt generado correctamente."
            $finalAdminHash = $generatedHash
        } else {
            Write-WarnText "No se pudo generar hash automaticamente (node/bcryptjs no disponible)."
            $manualHash = Read-WizardValue -Label "ADMIN_PASSWORD_HASH" -CurrentValue $currentAdminPasswordHash -Mandatory
            $finalAdminHash = $manualHash
        }
    } else {
        $finalAdminHash = $currentAdminPasswordHash
    }
}

$lines = Set-EnvValue -Lines $lines -Key "DB_USER" -Value $DbUser
$lines = Set-EnvValue -Lines $lines -Key "DB_PASSWORD" -Value $DbPassword
$lines = Set-EnvValue -Lines $lines -Key "DB_NAME" -Value $DbName
$lines = Set-EnvValue -Lines $lines -Key "DB_PORT" -Value "$DbPort"
$lines = Set-EnvValue -Lines $lines -Key "ADMIN_EMAIL" -Value $AdminEmail
$lines = Set-EnvValue -Lines $lines -Key "ADMIN_FULL_NAME" -Value $AdminFullName
$lines = Set-EnvValue -Lines $lines -Key "ADMIN_PHONE" -Value $AdminPhone
$lines = Set-EnvValue -Lines $lines -Key "ADMIN_PASSWORD_HASH" -Value $finalAdminHash

Set-Content -Path $EnvFile -Value $lines -Encoding UTF8

Write-Ok ""
Write-Ok "Configuracion guardada en: App/.env.docker"
Write-Ok "DB_USER=$DbUser"
Write-Ok "DB_NAME=$DbName"
Write-Ok "ADMIN_EMAIL=$AdminEmail"

$shouldStart = $StartAfterSetup

if (-not $NonInteractive -and -not $StartAfterSetup) {
    $answer = Read-Host "Deseas levantar Docker ahora? (y/N)"
    if ($answer -match '^(y|yes|s|si)$') {
        $shouldStart = $true
    }
}

if ($shouldStart) {
    try {
        $dockerCmd = Get-Command docker -ErrorAction Stop
        if (-not $dockerCmd) {
            throw "Docker no esta disponible en PATH"
        }

        Push-Location $AppDir
        try {
            if ($ResetVolumes) {
                Write-WarnText "Reseteando volumenes (docker compose down -v)..."
                docker compose --env-file .env.docker down -v
            }

            Write-Info "Levantando stack con .env.docker..."
            docker compose --env-file .env.docker up -d

            Write-Ok "Servicios levantados."
            Write-Info "Revisa estado con: cd App; docker compose ps"
            Write-Info "Logs DB: cd App; docker compose logs -f postgres"
        } finally {
            Pop-Location
        }
    } catch {
        Write-Err "No se pudo ejecutar Docker automaticamente: $($_.Exception.Message)"
        Write-Info "Ejecuta manualmente: cd App; docker compose --env-file .env.docker up -d"
    }
} else {
    Write-Info ""
    Write-Info "Siguiente paso: cd App; docker compose --env-file .env.docker up -d"
}
