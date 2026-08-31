<#
.SYNOPSIS
    Серверийг дахин асаана (`.env` тохиргоо өөрчилсний дараа).

.DESCRIPTION
    `.env` файлыг сервер зөвхөн ЭХЛЭХ үедээ уншдаг тул тохиргоо (SMTP, порт,
    өгөгдлийн сан) өөрчилсний дараа заавал дахин асаах шаардлагатай.

    Windows Service бүртгэсэн бол `Restart-Service` ашиглана.
    Эс бөгөөс тухайн портыг эзэлсэн процессыг зогсоож, шинээр асаана.

.PARAMETER Port
    Сонсох порт. Хоосон бол `.env`-ээс уншина.

.PARAMETER Rebuild
    Дахин асаахын өмнө `pnpm build` ажиллуулна (кодоо өөрчилсөн үед).

.EXAMPLE
    .\scripts\restart-server.ps1

.EXAMPLE
    .\scripts\restart-server.ps1 -Rebuild
#>

[CmdletBinding()]
param(
    [int]$Port = 0,
    [switch]$Rebuild,
    [string]$ServiceName = 'ShalgaltPlatform'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$env:Path = "$env:APPDATA\npm;$env:Path"

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2{ param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 1. Портыг .env-ээс тодорхойлох
# ---------------------------------------------------------------------------
$envPath = Join-Path $RepoRoot '.env'
if (-not (Test-Path $envPath)) { Write-Err2 ".env олдсонгүй."; exit 1 }

if ($Port -eq 0) {
    $line = Select-String -Path $envPath -Pattern '^API_PORT=(\d+)' | Select-Object -First 1
    $Port = if ($line) { [int]$line.Matches[0].Groups[1].Value } else { 8080 }
}
Write-Ok "Порт: $Port"

# ---------------------------------------------------------------------------
# 2. Шаардвал дахин build
# ---------------------------------------------------------------------------
if ($Rebuild) {
    Write-Step 'Дахин build хийх'
    Push-Location $RepoRoot
    try {
        pnpm build
        if ($LASTEXITCODE -ne 0) { Write-Err2 'Build амжилтгүй.'; exit 1 }
        Write-Ok 'Build бэлэн'
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# 3. Windows Service байвал түүгээр
# ---------------------------------------------------------------------------
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Step "Windows Service '$ServiceName' дахин асаах"
    try {
        Restart-Service -Name $ServiceName -Force
        Write-Ok 'Дахин асаалаа'
    }
    catch {
        Write-Err2 "Дахин асааж чадсангүй: $($_.Exception.Message)"
        Write-Warn2 'АДМИН эрхээр PowerShell нээж дахин оролдоно уу.'
        exit 1
    }
}
else {
    # -----------------------------------------------------------------------
    # 4. Service байхгүй — портыг эзэлсэн процессыг зогсооно
    # -----------------------------------------------------------------------
    Write-Step 'Ажиллаж буй серверийг зогсоох'

    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        # ⚠ `$pid` бол PowerShell-ийн уншихад зориулсан хувьсагч — дарж бичиж болохгүй
        $targetPid = $conn[0].OwningProcess
        try {
            Stop-Process -Id $targetPid -Force -ErrorAction Stop
            Start-Sleep -Seconds 3
            Write-Ok "PID $targetPid зогслоо"
        }
        catch {
            Write-Err2 "PID $targetPid-ийг зогсоож чадсангүй: $($_.Exception.Message)"
            Write-Warn2 'Энэ процессыг зогсооход АДМИН эрх шаардлагатай.'
            Write-Warn2 'Шийдэл (аль нэгийг сонгоно):'
            Write-Warn2 "  1. АДМИН PowerShell нээгээд:  Stop-Process -Id $targetPid -Force"
            Write-Warn2 '  2. Компьютероо дахин асаах'
            Write-Warn2 '  3. Windows Service болгож бүртгэх: .\scripts\finish-deploy.ps1 (админ эрхээр)'
            exit 1
        }
    }
    else {
        Write-Ok 'Ажиллаж буй сервер алга'
    }

    # -----------------------------------------------------------------------
    # 5. Шинээр асаах
    # -----------------------------------------------------------------------
    Write-Step 'Серверийг асаах'

    $entry = Join-Path $RepoRoot 'apps\api\dist\index.js'
    if (-not (Test-Path $entry)) {
        Write-Err2 "Build гаралт олдсонгүй: $entry"
        Write-Warn2 '`-Rebuild` тугтай дахин ажиллуулна уу.'
        exit 1
    }

    $logDir = Join-Path $RepoRoot 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    $env:NODE_ENV = 'production'
    Start-Process -FilePath (Get-Command node).Source -ArgumentList $entry `
        -WorkingDirectory $RepoRoot -NoNewWindow `
        -RedirectStandardOutput (Join-Path $logDir 'server.log') `
        -RedirectStandardError (Join-Path $logDir 'server-error.log') | Out-Null

    Start-Sleep -Seconds 6
}

# ---------------------------------------------------------------------------
# 6. Шалгах
# ---------------------------------------------------------------------------
Write-Step 'Шалгах'

$ok = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 4
        Write-Ok "API: $($health.status) · сан: $($health.database)"
        $ok = $true
        break
    } catch { Start-Sleep -Seconds 2 }
}

if (-not $ok) {
    Write-Err2 'Сервер хариу өгөхгүй байна.'
    Write-Warn2 "Лог: $RepoRoot\logs\server-error.log"
    exit 1
}

# SMTP төлөв
try {
    $smtp = & pnpm --filter '@shalgalt/api' email:check 2>&1 | Out-String
    if ($smtp -match '✔') { Write-Ok 'Имэйл: ажиллаж байна' }
    elseif ($smtp -match 'тохируулаагүй') { Write-Warn2 'Имэйл: тохируулаагүй (.\scripts\setup-email.ps1)' }
    else { Write-Warn2 'Имэйл: алдаатай — pnpm --filter @shalgalt/api email:check' }
} catch { }

$addresses = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
                   (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq 'Up' })

Write-Host ''
Write-Host '  Хаяг:' -ForegroundColor Green
foreach ($a in $addresses) { Write-Host "    http://$($a.IPAddress):$Port" }
Write-Host ''
