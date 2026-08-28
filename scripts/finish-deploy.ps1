<#
.SYNOPSIS
    Deploy-ийн ЭЦСИЙН алхам — админ эрх шаардах хэсэг.

.DESCRIPTION
    Бэлтгэл ажил (тохиргоо, өгөгдлийн сан, build) аль хэдийн дууссан.
    Энэ скрипт зөвхөн админ эрх шаардах 3 зүйлийг гүйцэтгэнэ:

      1. Windows Firewall-д дүрэм нэмэх
      2. Компьютерын унтах горимыг унтраах
      3. Windows Service болгож бүртгэх (автоматаар асна, унтарвал сэргэнэ)

.EXAMPLE
    # PowerShell-ийг "Run as administrator" гэж нээгээд:
    cd C:\Users\purev.b\burtgel-web\shalgalt-platform
    .\scripts\finish-deploy.ps1
#>

[CmdletBinding()]
param(
    [int]$Port = 8080,
    [string]$ServiceName = 'ShalgaltPlatform',
    [switch]$SkipPowerSettings
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2{ param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err2 'Энэ скриптэд АДМИН эрх шаардлагатай.'
    Write-Warn2 'PowerShell дээр баруун товч → "Run as administrator" гэж нээнэ үү.'
    exit 1
}

$entry = Join-Path $RepoRoot 'apps\api\dist\index.js'
if (-not (Test-Path $entry)) {
    Write-Err2 "Build гаралт олдсонгүй: $entry"
    Write-Warn2 'Эхлээд `.\scripts\setup-server.ps1 -Port 8080 -SkipService -SkipAdmin` ажиллуулна уу.'
    exit 1
}

# ---------------------------------------------------------------------------
# 1. Firewall
# ---------------------------------------------------------------------------
Write-Step 'Windows Firewall'

$ruleName = "Shalgalt Platform (TCP $Port)"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
    -LocalPort $Port -Action Allow -Profile Private,Domain | Out-Null
Write-Ok "$ruleName (Private + Domain)"
Write-Warn2 'Public профайлд зориуд нээгээгүй — нээлттэй Wi-Fi дээр аюулгүй байхын тулд.'

# Сүлжээ Public бол Private болгоно
$publicProfiles = @(Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public')
foreach ($profile in $publicProfiles) {
    Set-NetConnectionProfile -InterfaceAlias $profile.InterfaceAlias -NetworkCategory Private
    Write-Ok "'$($profile.InterfaceAlias)' сүлжээ → Private"
}

# ---------------------------------------------------------------------------
# 2. Тэжээлийн тохиргоо — 24/7 ажиллахын тулд унтахгүй байх
# ---------------------------------------------------------------------------
if (-not $SkipPowerSettings) {
    Write-Step 'Тэжээлийн тохиргоо (24/7)'
    powercfg /change standby-timeout-ac 0    | Out-Null
    powercfg /change hibernate-timeout-ac 0  | Out-Null
    powercfg /change disk-timeout-ac 0       | Out-Null
    powercfg /hibernate off                  2>$null | Out-Null
    Write-Ok 'Унтах / hibernate унтраалаа (дэлгэц унтарч болно)'
}

# ---------------------------------------------------------------------------
# 3. Windows Service
# ---------------------------------------------------------------------------
Write-Step 'Windows Service бүртгэх'

$toolsDir = Join-Path $RepoRoot '.tools'
$nssmExe = Join-Path $toolsDir 'nssm.exe'

if (-not (Test-Path $nssmExe)) {
    Write-Host '    NSSM татаж байна…'
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $zip = Join-Path $env:TEMP 'nssm.zip'
    $extract = Join-Path $env:TEMP "nssm-$(Get-Random)"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $extract -Force
        $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
        $found = Get-ChildItem -Path $extract -Recurse -Filter 'nssm.exe' |
            Where-Object { $_.FullName -match [regex]::Escape($arch) } | Select-Object -First 1
        if (-not $found) { throw 'архивт nssm.exe олдсонгүй' }
        Copy-Item $found.FullName $nssmExe -Force
        Write-Ok 'NSSM бэлэн'
    }
    catch {
        Write-Err2 "NSSM татаж чадсангүй: $_"
        Write-Warn2 'Гараар https://nssm.cc/download-оос татаж .tools\nssm.exe болгоно уу.'
        exit 1
    }
    finally { Remove-Item $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue }
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Warn2 "'$ServiceName' аль хэдийн байна — дахин үүсгэж байна"
    & $nssmExe stop $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & $nssmExe remove $ServiceName confirm 2>$null | Out-Null
    Start-Sleep -Seconds 2
}

$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$node = (Get-Command node).Source

& $nssmExe install $ServiceName $node $entry                          | Out-Null
& $nssmExe set $ServiceName AppDirectory   $RepoRoot                  | Out-Null
& $nssmExe set $ServiceName DisplayName    'Шалгалтын платформ'       | Out-Null
& $nssmExe set $ServiceName Description    'Сурагчийн өмнөх/дараах үнэлгээний платформ' | Out-Null
& $nssmExe set $ServiceName Start          SERVICE_AUTO_START         | Out-Null
& $nssmExe set $ServiceName AppStdout      (Join-Path $logDir 'service.log')       | Out-Null
& $nssmExe set $ServiceName AppStderr      (Join-Path $logDir 'service-error.log') | Out-Null
& $nssmExe set $ServiceName AppRotateFiles 1                          | Out-Null
& $nssmExe set $ServiceName AppRotateBytes 10485760                   | Out-Null
& $nssmExe set $ServiceName AppExit Default Restart                   | Out-Null
& $nssmExe set $ServiceName AppRestartDelay 5000                      | Out-Null
& $nssmExe set $ServiceName AppEnvironmentExtra 'NODE_ENV=production' | Out-Null

Start-Service -Name $ServiceName
Start-Sleep -Seconds 6

# ---------------------------------------------------------------------------
# 4. Шалгах
# ---------------------------------------------------------------------------
Write-Step 'Шалгах'

$ok = $false
for ($i = 1; $i -le 12; $i++) {
    try {
        $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 4
        Write-Ok "API: $($health.status) · сан: $($health.database)"
        $page = Invoke-WebRequest "http://localhost:$Port/" -TimeoutSec 6 -UseBasicParsing
        Write-Ok "Вэб: HTTP $($page.StatusCode)"
        $ok = $true
        break
    } catch { Start-Sleep -Seconds 2 }
}

if (-not $ok) {
    Write-Err2 'Сервер хариу өгөхгүй байна.'
    Write-Warn2 "Лог: $logDir\service-error.log"
    exit 1
}

$addresses = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
                   (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq 'Up' })

Write-Host ''
Write-Host '===========================================================' -ForegroundColor Green
Write-Host '  DEPLOY ДУУСЛАА' -ForegroundColor Green
Write-Host '===========================================================' -ForegroundColor Green
Write-Host ''
foreach ($a in $addresses) { Write-Host "  Хаяг : http://$($a.IPAddress):$Port" -ForegroundColor White }
Write-Host ''
Write-Host '  Үйлчилгээ автоматаар асна (компьютер асахад).'
Write-Host ''
Write-Host '  Удирдах:'
Write-Host "    Get-Service $ServiceName"
Write-Host "    Restart-Service $ServiceName"
Write-Host "    Get-Content logs\service.log -Tail 50 -Wait"
Write-Host ''
Write-Host '  Дараагийн алхам:'
Write-Host '    1. Router дээр DHCP reservation хийж IP-г тогтмол болгох (ЧУХАЛ)'
Write-Host '    2. .\scripts\setup-email.ps1  → имэйл тохируулах'
Write-Host '    3. Өдөр бүрийн нөөцлөлт тохируулах (DEPLOY.md §8)'
Write-Host ''
