[CmdletBinding()]
param(
  [int]$Port,
  [switch]$NoKill,
  [switch]$ForceKillPort,
  [switch]$Detached,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "App"
$EnvPath = Join-Path $AppDir ".env"
$NodemonJs = Join-Path $AppDir "node_modules\nodemon\bin\nodemon.js"

function Resolve-NodeExe {
  $candidates = @()

  try {
    $command = Get-Command node.exe -ErrorAction Stop
    if ($command -and $command.Source) {
      $candidates += $command.Source
    }
  } catch {
  }

  $candidates += @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Progra~1\nodejs\node.exe"
  )

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "No se encontró node.exe. Instala Node.js o agrégalo al PATH."
}

function Resolve-Port {
  param(
    [int]$ExplicitPort,
    [string]$DotEnvPath
  )

  if ($ExplicitPort) {
    return $ExplicitPort
  }

  if (Test-Path $DotEnvPath) {
    foreach ($line in Get-Content -Path $DotEnvPath) {
      if ($line -match '^\s*PORT\s*=\s*"?([^"#\s]+)"?\s*$') {
        return [int]$matches[1]
      }
    }
  }

  return 3001
}

function Get-ListeningProcessIds {
  param(
    [int]$PortNumber
  )

  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $PortNumber -ErrorAction Stop
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    $netstatExe = Join-Path $env:SystemRoot "System32\netstat.exe"
    $matches = & $netstatExe -ano -p tcp | Select-String -Pattern "^\s*TCP\s+\S+:$PortNumber\s+\S+\s+LISTENING\s+(\d+)\s*$"
    if (-not $matches) {
      return @()
    }

    $ids = foreach ($match in $matches) {
      if ($match.Matches.Count -gt 0) {
        [int]$match.Matches[0].Groups[1].Value
      }
    }

    return @($ids | Select-Object -Unique)
  }
}

function Get-ProcessInfo {
  param(
    [int]$ProcessId
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue

  [pscustomobject]@{
    Id = $ProcessId
    Name = $process.ProcessName
    CommandLine = $cim.CommandLine
  }
}

function Test-SafeToStop {
  param(
    [object]$ProcessInfo,
    [string]$ExpectedPath
  )

  $name = [string]($ProcessInfo.Name)
  $commandLine = [string]($ProcessInfo.CommandLine)

  if ($name -match '^(node|nodemon)$') {
    return $true
  }

  if ($commandLine -like "*$ExpectedPath*") {
    return $true
  }

  return $false
}

function Stop-ExistingListener {
  param(
    [int]$PortNumber,
    [string]$ExpectedPath,
    [switch]$SkipKill,
    [switch]$AllowForce
  )

  $processIds = @(Get-ListeningProcessIds -PortNumber $PortNumber)
  if (-not $processIds.Count) {
    Write-Host "[restart-dev] No había proceso escuchando en el puerto $PortNumber."
    return
  }

  foreach ($processId in $processIds) {
    $info = Get-ProcessInfo -ProcessId $processId
    $description = if ($info.Name) {
      "$($info.Name) (PID $processId)"
    } else {
      "PID $processId"
    }

    if ($SkipKill) {
      throw "El puerto $PortNumber ya está ocupado por $description. Usa -NoKill solo si arrancarás en otro puerto."
    }

    $safeToStop = Test-SafeToStop -ProcessInfo $info -ExpectedPath $ExpectedPath
    if (-not $safeToStop -and -not $AllowForce) {
      throw "El puerto $PortNumber está ocupado por $description y no parece ser ShowDeal. Usa -ForceKillPort si quieres cerrarlo de todas formas."
    }

    Write-Host "[restart-dev] Cerrando $description en el puerto $PortNumber..."
    Stop-Process -Id $processId -Force
  }

  Start-Sleep -Seconds 1
}

if (-not (Test-Path $AppDir)) {
  throw "No se encontró la carpeta App en $RepoRoot."
}

if (-not (Test-Path $NodemonJs)) {
  throw "No se encontró nodemon en $NodemonJs. Ejecuta npm install dentro de App."
}

$ResolvedPort = Resolve-Port -ExplicitPort $Port -DotEnvPath $EnvPath
$NodeExe = Resolve-NodeExe
$StartArgs = @($NodemonJs, "src/server.js")

Write-Host "[restart-dev] Repo: $RepoRoot"
Write-Host "[restart-dev] App:  $AppDir"
Write-Host "[restart-dev] Port: $ResolvedPort"
Write-Host "[restart-dev] Node: $NodeExe"

if ($DryRun) {
  $currentListeners = @(Get-ListeningProcessIds -PortNumber $ResolvedPort)
  if ($currentListeners.Count) {
    foreach ($processId in $currentListeners) {
      $info = Get-ProcessInfo -ProcessId $processId
      $description = if ($info.Name) {
        "$($info.Name) (PID $processId)"
      } else {
        "PID $processId"
      }
      Write-Host "[restart-dev] Listener actual detectado en ${ResolvedPort}: $description"
    }
  } else {
    Write-Host "[restart-dev] No hay listeners activos en el puerto $ResolvedPort."
  }
  Write-Host "[restart-dev] Dry run: no se lanzó el servidor."
  Write-Host "[restart-dev] Comando: $NodeExe $($StartArgs -join ' ')"
  exit 0
}

Stop-ExistingListener -PortNumber $ResolvedPort -ExpectedPath $RepoRoot -SkipKill:$NoKill -AllowForce:$ForceKillPort

if ($Detached) {
  $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
  $cmdArgs = "/k `"$NodeExe`" `"$NodemonJs`" src/server.js"
  $process = Start-Process -FilePath $cmdExe -ArgumentList $cmdArgs -WorkingDirectory $AppDir -PassThru
  Write-Host "[restart-dev] Servidor dev iniciado en una nueva ventana. PID: $($process.Id)"
  Write-Host "[restart-dev] URL: http://localhost:$ResolvedPort"
  exit 0
}

Write-Host "[restart-dev] Iniciando servidor dev con nodemon..."
Push-Location $AppDir
try {
  & $NodeExe @StartArgs
} finally {
  Pop-Location
}
