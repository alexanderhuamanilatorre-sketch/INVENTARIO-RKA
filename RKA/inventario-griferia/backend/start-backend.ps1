$ErrorActionPreference = "Stop"

try {
  Get-Command npm -ErrorAction Stop | Out-Null
  Get-Command node -ErrorAction Stop | Out-Null

  $backendPath = $PSScriptRoot
  $dependencyPath = Join-Path $env:LOCALAPPDATA "RKA\backend-dependencies"
  $nodeModulesPath = Join-Path $dependencyPath "node_modules"
  $packageJsonPath = Join-Path $backendPath "package.json"
  $packageLockPath = Join-Path $backendPath "package-lock.json"

  if (-not (Test-Path $packageJsonPath)) {
    throw "No se encontró el archivo de dependencias: $packageJsonPath"
  }
  if (-not (Test-Path $packageLockPath)) {
    throw "No se encontró el archivo de bloqueo: $packageLockPath"
  }

  New-Item -ItemType Directory -Path $dependencyPath -Force | Out-Null
  Copy-Item $packageJsonPath $dependencyPath -Force
  Copy-Item $packageLockPath $dependencyPath -Force

  $packageHash = (Get-FileHash $packageJsonPath -Algorithm SHA256).Hash
  $lockHash = (Get-FileHash $packageLockPath -Algorithm SHA256).Hash
  $dependencyHash = "$packageHash`:$lockHash"
  $stampPath = Join-Path $dependencyPath "package-lock.sha256"
  $installedHash = if (Test-Path $stampPath) {
    (Get-Content $stampPath -Raw).Trim()
  } else {
    ""
  }

  if (-not (Test-Path $nodeModulesPath) -or $installedHash -ne $dependencyHash) {
    Write-Host "Instalando dependencias fuera de la carpeta del proyecto..."
    Push-Location $dependencyPath
    try {
      & npm ci --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) {
        throw "npm ci terminó con el código $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
    Set-Content -Path $stampPath -Value $dependencyHash -Encoding ASCII
  }

  $env:NODE_PATH = if ($env:NODE_PATH) {
    "$nodeModulesPath$([IO.Path]::PathSeparator)$env:NODE_PATH"
  } else {
    $nodeModulesPath
  }

  Set-Location $backendPath
  Write-Host "Iniciando API RKA en http://localhost:3000"
  Write-Host "Frontend: http://localhost:3000/index.html"
  & node .\src\server.js
  exit $LASTEXITCODE
} catch {
  Write-Error $_
  exit 1
}
